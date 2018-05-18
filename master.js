const { splitUrl } = require('./http/Parser');

const { fork } = require('child_process');
const os = require('os');

const cpus = os.cpus().length - 1;
// const cpus = 1;

const workers = [];
const visited = {};
const queue = initializeWorkQueue();

let prevTime = 0;

const firstWorkItem = getWorkItem();

// Initialize workers
for (let i = 0; i < cpus; ++i) {
  const worker = fork('fetcher.js', [], {
    execArgv: [ `--inspect=${Math.floor(Math.random() * (65000 - 20000) + 20000)}` ],
  });

  worker.on('message', (message, handle) => {
    return handleWorkerMessage.call(worker, message, handle);
  });

  if (i === 0) {
    worker.send(firstWorkItem);
  }

  // Set new property "available" on worker once it has nothing to do
  worker.available = true;

  workers.push(
    worker
  );
}

/**
 * Handle fetcher messaging
 * @param {any} message
 * @param {Socket} handle
 * @this ChildProcess
 */
function handleWorkerMessage(message, handle) {
  this.available = true;
  let { success, links, redirect, host, route } = message;

  if (!visited[host]) {
    visited[host] = new Set();
  }
  visited[host].add(route);

  if (redirect) {
    queue[redirect.host] = queue[host];
    queue[host] = undefined;
    host = redirect.host;
  }

  if (success === true && links instanceof Array) {
    links.forEach((link) => {
      const { linkHost, route } = splitUrl(link);

      if (!queue[linkHost]) {
        queue[linkHost] = {
          routes: new Set(),
          connectionAt: 0,
        };
      }

      if (visited[linkHost] && visited[linkHost].has(route)) {
        return null;
      }

      return queue[linkHost].routes.add(route);
    });
  }

  assignWorkerJobs();
}

/**
 * Assign jobs to all available workers if there are any.
 * Will be triggered when the master receives a finish message from a worker or
 * when a domain becomes politely crawlable (if previously no job could be assigned to a worker because of this).
 */
function assignWorkerJobs() {
  for (let worker of workers) {
    if (worker.available === false) {
      continue;
    }

    const workItem = getWorkItem();
    if (workItem === null) {
      break;
    }

    worker.available = false;

    // console.log(Date.now() - prevTime);
    prevTime = Date.now();
    worker.send(workItem);
  }
}

/**
 * Get a work item and mark the domain with the current timestamp for being polite
 * and not exceeding 1connection/sec/domain.
 * @returns {{ host: string, route: string } | null}
 */
function getWorkItem() {
  const availableDomains = Object.entries(queue)
    .filter(([ key, value ]) => {
      return value.routes.size > 0;
    });

  if (!availableDomains.length) {
    return null;
  }

  let minRemainingTime = 1000;
  const politelyAvailableDomains = availableDomains
    .filter(([ domain, obj ]) => {
      const timePassed = Date.now() - obj.connectionAt;
      const isPolite = timePassed > 1000;

      if (!isPolite) {
        const remainingTime = 1000 - timePassed;
        minRemainingTime = minRemainingTime > remainingTime ? remainingTime : minRemainingTime;
      }

      return isPolite;
    });

  if (!politelyAvailableDomains.length) {
    setTimeout(assignWorkerJobs, minRemainingTime);
    return null;
  }

  const [ domain, obj ] = politelyAvailableDomains[0];

  obj.connectionAt = Date.now();

  let route = obj.routes.values().next().value;
  obj.routes.delete(route);

  if (obj.prefix && obj.prefix.length) {
    route = `${obj.prefix}${route}`;
  }

  return { host: domain, route: route };
}

/**
 * Create the work queue with the starting url
 * @returns {object} Object containing the hostname as key and a Set of routes as value
 */
function initializeWorkQueue() {
  return {
    'riweb.tibeica.com': {
      prefix: '/crawl',
      routes: new Set([ '/' ]),
      connectionAt: 0,
    },
  };
}
