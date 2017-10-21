const request = require('request');
const WebSocket = require('ws');
const generateUuid = require('uuid/v4');

const fs = require('fs');

const headerSeparator = "\r\n";

const riff = fs.readFileSync(__dirname + "/riff.wav");

const requestId = generateUuid().replace(/-/g, '');

const createBaseHeader = function(path, type) {
  let uuid = requestId;
  let timestamp = new Date().toISOString();
  let baseHeaders = "Path: " + path + headerSeparator
      + "X-RequestId: " + uuid + headerSeparator
      + "X-Timestamp: " + timestamp + headerSeparator
      + "Content-Type: " + type + headerSeparator;

  return baseHeaders;
}

const buildFirstMessage = function() {
  let payload = createBaseHeader("speech.config", "application/json; charset=utf-8")
      + headerSeparator
      + `{"context":{"system":{"version":"2.0.12341"},"os":{"platform":"N/A","name":"N/A","version":"N/A"},"device":{"manufacturer":"N/A","model":"N/A","version":"N/A"}}}`;

  return payload;
}

const buildAudioMessage = function(content) {
  let headers = createBaseHeader("audio", "audio/x-wav");
  
  let headersArray = new Buffer(headers);

  let buffer = new ArrayBuffer(2 + headersArray.length + content.length);

  let sizeDataView = new DataView(buffer, 0, 2);
  let headersDataView = new DataView(buffer, 2, headersArray.length);
  let contentDataView = new DataView(buffer,
    2 + headersArray.length,
    content.length);

  sizeDataView.setUint16(0, headersArray.length);

  for(let i = 0; i < headersArray.length; i++) {
    headersDataView.setUint8(i, headersArray[i]);
  }

  for(let i = 0; i < content.length; i++) {
    contentDataView.setUint8(i, content[i]);
  }

  return buffer;
}

const buildRiffMessage = function() {
  return buildAudioMessage(riff);
}

const fromRawToMessage = function(raw) {
  let split = raw.split(headerSeparator + headerSeparator);
  let headersAsText = split[0];
  let payloadAsText = split[1];
  let headers = headersAsText
      .split(headerSeparator)
      .reduce((map, obj) => {
        let headerSplit = obj.split(":");
        map[headerSplit[0].trim()] = headerSplit[1].trim();
        return map;
      }, {});
  let payload = JSON.parse(payloadAsText);

  return {
    headers,
    payload
  };
}

module.exports = class SpeechToTextClient {

  constructor(key) {
    this.key = key;
    this.listeners = {};
    this.TOKEN_ENDPOINT = 'https://api.cognitive.microsoft.com/sts/v1.0/issueToken';
    this.SPEECH_PATH = '/speech/recognition/interactive/cognitiveservices/v1';
    this.SPEECH_ENDPOINT = 'wss://speech.platform.bing.com' + this.SPEECH_PATH + '?language=en-US';
  }

  renewToken() {
    let options = {
      url: this.TOKEN_ENDPOINT,
      headers: {
        'Ocp-Apim-Subscription-Key': this.key
      }
    }

    return new Promise((resolve, reject) => {
      request.post(options, (error, res, body) => {
        if (error) {
          return reject(error);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`request failed for speech client with status code ${res.statusCode}.`));
        }

        resolve(body);
      });
    });
  }

  connect() {
    this.renewToken()
        .then(token => {
          let headers = {
            'Authorization': token
          };

          let options = {
            headers: headers
          };

          console.log('connecting to web socket', options);

          this.wsc = new WebSocket(this.SPEECH_ENDPOINT, options);

          this.wsc.on('open', (...args) => {
            console.log("opened web socket to client", args);

            this.wsc.send(buildFirstMessage());

            this.wsc.send(buildRiffMessage(), () => this.ready = true);

          });

          this.wsc.on('close', (...args) => console.log("closed with code", args));

          this.wsc.on('message', (raw) => {
            let message = fromRawToMessage(raw);
            let type = message.headers["Path"];
            if(this.listeners['message']) {
              this.listeners['message'].forEach(f => f(message));
            }
            if(this.listeners[type]) {
              this.listeners[type].forEach(f => f(message));
            }
          });
        })
        .catch(e => {
          console.log("couldn't connect to service", e);
        });
  }

  on(type, f) {
    if(!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(f);
  }

  send(buffer) {

    this.wsc.send(buildAudioMessage(buffer));
  }

  close() {
    try {
      this.wsc.terminate();
    } catch (e) {
      console.log(e);
    }
  }
}
