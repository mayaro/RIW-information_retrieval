const dgram = require('dgram');

const DefaultPort = 53;
const DefaultNameserver = '8.8.8.8';

/**
 * @typedef {object} DnsResponse
 * @property {Flags} flags
 * @property {string} name
 * @property {Answer[]} answers
 *
 * @typedef {object} Answer
 * @property {string} name
 * @property {string} address
 * @property {number} type
 * @property {number} class
 * @property {number} ttl
 */

module.exports = exports = class Client {
  /**
   * @param {string} hostname
   * @param {boolean} [recursionDesired=false]
   * @param {string} [nameserver=DefaultNameserver]
   * @param {number} [port=DefaultPort]
   */
  constructor(hostname, recursionDesired = false, nameserver = DefaultNameserver, port = DefaultPort) {
    this.hostname = hostname;
    this.nameserver = nameserver;
    this.port = port;
    this.recursionDesired = recursionDesired === true ? 1 : 0;

    // Comunication-related properties
    this.call = null;
    this.response = null;
    this.error = null;
    this.socket = this.createSocket();

    // Initialize comunication
    this.timestamp = Date.now();
    this.socket.send(
      this.createQuestion(),
      this.port,
      this.nameserver,
      (err) => {
        if (!err) {
          return;
        }

        console.error(err.message);

        this.error = err.message;
        this.call = null;
      }
    );
  }

  /**
   * @returns {Promise} Promise that when fulfilled will return the ip addresses if found.
   */
  getAddresses() {
    return new Promise((resolve, reject) => {
      if (this.call instanceof Promise) {
        return this.call.then(
          () => {
            return resolve(
              getIpAddressesFromResponse(this.response)
            );
          },
          () => {
            return reject(this.err);
          }
        );
      }

      if (this.response !== null) {
        return resolve(
          getIpAddressesFromResponse(this.response)
        );
      }

      return reject(this.error);
    });
  }

  /**
   * @private
   * @argument {Buffer} message
   * @returns {DnsResponse}
   */
  parseDnsAnswer(message) {
    const response = { };

    let indexToRead = 2;
    // Skip reading the response id

    const flags = response.flags = this.parseFlags(
      message.readUInt16BE(indexToRead)
    );

    indexToRead = indexToRead + 2;
    message.readUInt16BE(indexToRead = indexToRead + 2);

    const numberOfAdresses = message.readUInt16BE(indexToRead);
    indexToRead = indexToRead + 2;

    const numberOfAuthorities = message.readUInt16BE(indexToRead);
    indexToRead = indexToRead + 2;

    const numberOfAdditionalResponses = message.readUInt16BE(indexToRead);
    indexToRead = indexToRead + 2;

    const name = [];
    indexToRead = this.parseChunkFromBuffer(message, indexToRead, name);
    response.name = name.join('.');

    response.flags.type = message.readUInt16BE(indexToRead);
    indexToRead = indexToRead + 2;

    response.flags.class = message.readUInt16BE(indexToRead);
    indexToRead = indexToRead + 2;

    response.answers = [];
    const totalNumberOfAnswers = numberOfAdresses + numberOfAuthorities + numberOfAdditionalResponses;
    for (let answerIdx = 0; answerIdx < totalNumberOfAnswers; answerIdx++) {
      const answer = {
        name: '',
        address: '',
        type: 1,
        class: 1,
        ttl: 0,
      };

      let tempName = [];
      indexToRead = this.parseChunkFromBuffer(message, indexToRead, tempName);
      answer.name = tempName.join('.');

      answer.type = message.readUInt16BE(indexToRead);
      indexToRead = indexToRead + 2;

      answer.class = message.readUInt16BE(indexToRead);
      indexToRead = indexToRead + 2;

      answer.ttl = message.readUInt32BE(indexToRead);
      indexToRead = indexToRead + 4;

      const addressLength = message.readUInt16BE(indexToRead);
      indexToRead = indexToRead + 2;

      response.answers.push(answer);

      if (answer.type === 1) {
        const addressArr = [];

        for (let idx = 0; idx < addressLength; idx++) {
          addressArr.push(
            message.readUInt8(indexToRead)
          );
          indexToRead++;
        }

        answer.address = addressArr.join('.');
        continue;
      }

      if (answer.type === 28) {
        const addressArr = [];

        for (let idx = 0; idx < addressLength; idx = idx + 2) {
          addressArr.push(
            message.slice(indexToRead, indexToRead + 2).toString('hex')
          );
          indexToRead = indexToRead + 2;
        }

        answer.address = addressArr.join(':');
        continue;
      }

      tempName = [];
      indexToRead = this.parseChunkFromBuffer(message, indexToRead, tempName);
      answer.address = tempName.join('.');
    }

    return response;
  }

  /**
   * Perse the response flags "object" and retrieve the most important flags.
   *
   * @private
   * @param {number} flags
   * @returns {Flags}
   *
   * @typedef {object} Flags
   * @property {boolean} isResponse
   * @property {number} operationCode
   * @property {boolean} recursionDesired
   * @property {number} responseCode
   */
  parseFlags(flags) {
    return {
      isResponse: ((flags & (1 << 15)) >> 15) === 1,
      operationCode: (flags & (1 << 14 | 1 << 13 | 1 << 12 | 1 << 11)) >> 11,
      recursionDesired: ((flags & (1 << 7)) >> 7) === 1,
      responseCode: flags & (1 << 3 | 1 << 2 | 1 << 1 | 1 << 0),
    };
  }

  /**
   * Create a socket with bound events for error, close and message
   * used for retrieving a dns response.
   * @private
   * @returns {dgram.Socket}
   */
  createSocket() {
    const socket = dgram.createSocket('udp4');

    this.call = new Promise((resolve, reject) => {
      socket.once('error', (err) => {
        console.error(err.message);
        this.error = err.message;

        this.socket.close();

        reject();
      });

      socket.once('message', (message, info) => {
        this.response = this.parseDnsAnswer(message);
        socket.close();

        resolve();
        this.call = null;
      });
    });

    return socket;
  }

  /**
   * Read from a buffer a chunk until a separation 0 is found.
   *
   * @private
   * @param {Buffer} buffer
   * @param {number} startingIndex
   * @param {string[]} dest The array where the output data will be stored.
   * @returns {number} The index where the function stopped.
   */
  parseChunkFromBuffer(buffer, startingIndex, dest) {
    let index = startingIndex;

    while (buffer.readUInt8(index) !== 0) {
      const tagLength = buffer.readUInt8(index);

      // Specifies a address
      if (tagLength >= 192) {
        const pointerAddr = (buffer.readUInt16BE(index) & ~(1 << 15 | 1 << 14));

        this.parseChunkFromBuffer(buffer, pointerAddr, dest);
        index = index + 2;

        return index;
      }

      const particle = buffer.slice(++index, index + tagLength).toString();

      dest.push(particle);
      index = index + tagLength;
    }

    return ++index;
  }

  /**
   * Create a question for the current hostname, that will be sent to the authority.
   * @private
   * @returns {Buffer}
   */
  createQuestion() {
    const questionBuff = Buffer.alloc(
      12 + // DNS header length
      this.hostname.length +
      2 + // Question name length
      4 // QType and QClass
    );

    // Generate random Question Id and write it into the buffer
    const questionId = Math.trunc(Math.pow(2, 16) * Math.random());
    questionBuff.writeUInt16BE(questionId, 0);

    const flags = 0 | (this.recursionDesired << 8);
    questionBuff.writeUInt16BE(flags, 2);

    const questionCount = 1;
    questionBuff.writeUInt16BE(questionCount, 4);

    const questionStartOffset = 12;

    const particles = this.hostname.split('.');

    let questionIndex = 0;

    for (let particleIdx = 0; particleIdx < particles.length; ++particleIdx) {
      const particle = particles[particleIdx];
      const particleLength = particle.length;

      questionBuff.writeUInt8(particleLength, questionStartOffset + questionIndex);
      questionIndex++;

      for (let particleComponentIdx = 0; particleComponentIdx < particleLength; ++particleComponentIdx) {
        questionBuff.writeUInt8(particle[particleComponentIdx].charCodeAt(0), questionStartOffset + questionIndex);
        questionIndex++;
      }
    }

    questionBuff.writeUInt8(0, questionStartOffset + questionIndex);
    questionIndex++;

    questionBuff.writeUInt16BE(1, questionStartOffset + questionIndex); // QTYPE
    questionBuff.writeUInt16BE(1, questionStartOffset + questionIndex + 2); // QCLASS

    return questionBuff;
  }
};

/**
 * @param {DnsResponse} response
 * @returns {string[]}
 */
function getIpAddressesFromResponse(response) {
  if (!response.answers ||
    !(response.answers instanceof Array)) {
    return [];
  }

  return response.answers
    .filter((answer) => {
      return answer.type === 1 || answer.type === 28;
    })
    .map((answer) => {
      return { value: answer.address, ttl: answer.ttl, timestamp: this.timestamp };
    });
}
