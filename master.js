const { splitUrl } = require('./http/Parser');

const { fork } = require('child_process');
const os = require('os');

const cpus = os.cpus().length - 1;
// const cpus = 3;

const workers = [];
const visited = {};
const queue = initializeWorkQueue();

let isAssigningJobs = false;
let workItemRequested = false;
let prevTime = 0;

// Initialize workers
for (let i = 0; i < cpus; ++i) {
  const worker = fork('fetcher.js', [ i ], {
    execArgv: [ `--inspect=${Math.floor(Math.random() * (65000 - 20000) + 20000)}` ],
  });

  worker.on('message', (message, handle) => {
    return handleWorkerMessage.call(worker, message, handle);
  });

  worker.activePages = 0;

  const workItem = getWorkItem();
  if (workItem !== null) {
    worker.activePages = 1;
    worker.send(workItem);
  }

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
  this.activePages--;
  let { success, links, redirect, host, route } = message;

  if (!visited[host]) {
    visited[host] = new Set();
  }
  visited[host].add(route);

  if (redirect) {
    queue[redirect.host] = queue[host];
    delete queue[host];
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

      const newRoute = queue[linkHost].prefix ? queue[linkHost].prefix + route : route;
      if (visited[linkHost] && visited[linkHost].has(newRoute)) {
        return null;
      }

      return queue[linkHost].routes.add(route);
    });
  }

  if (isAssigningJobs === false) {
    isAssigningJobs = true;
    assignWorkerJobs();
    isAssigningJobs = false;
  }
}

/**
 * @argument {boolean} fromTimeout
 * Assign jobs to all available workers if there are any.
 * Will be triggered when the master receives a finish message from a worker or
 * when a domain becomes politely crawlable (if previously no job could be assigned to a worker because of this).
 */
function assignWorkerJobs(fromTimeout) {
  let job = null;

  if (!workers.every((w) => w.activePages < 5)) {
    return;
  }

  if (workItemRequested === true && fromTimeout === true) {
    workItemRequested = false;
  }

  const sortedWorkers = workers.sort((w1, w2) => w1.activePages - w2.activePages);

  for (let idx = 0; idx < sortedWorkers.length; idx++) {
    let worker = sortedWorkers[idx];

    if (worker.activePages >= 10) {
      continue;
    }

    job = getWorkItem();
    if (job === null) {
      return;
    }

    console.log(`got work item ${job.host}${job.route} on index ${idx} for worker ${worker.pid}`);

    // console.log(Date.now() - prevTime);
    // prevTime = Date.now();
    worker.activePages++;
    worker.send(job);

    if (idx === sortedWorkers.length - 1 && sortedWorkers.some((w) => {
      return w.activePages < 10;
    })) {
      idx = -1;
    }
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

  // console.log(availableDomains.length, politelyAvailableDomains.length);

  if (!politelyAvailableDomains.length) {
    if (workItemRequested === false) {
      workItemRequested = true;
      console.log('requested');
      setTimeout(assignWorkerJobs.bind(null, true), minRemainingTime);
    }

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
      connectionAt: Date.now(),
    },
  };
}
