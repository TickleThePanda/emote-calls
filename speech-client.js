const request = require('request');
const WebSocket = require('ws');
const generateUuid = require('uuid/v4');

const fs = require('fs');

const headerSeparator = "\r\n";

const riff = fs.readFileSync(__dirname + "/riff.wav");

const createBaseHeader = function(path) {
  let uuid = generateUuid().replace(/-/g, '');
  let timestamp = new Date().toISOString();
  let baseHeaders = "Path: " + path + headerSeparator
      + "X-RequestId: " + uuid + headerSeparator
      + "X-Timestamp: " + timestamp + headerSeparator
      + "Content-Type: " + "application/json; charset=utf-8" + headerSeparator;

  return baseHeaders;
}

const buildFirstMessage = function() {
  let payload = createBaseHeader("speech.config")
      + headerSeparator
      + `{"context":{"system":{"version":"2.0.12341"},"os":{"platform":"N/A","name":"N/A","version":"N/A"},"device":{"manufacturer":"N/A","model":"N/A","version":"N/A"}}}`;

  return payload;
}

const buildBinaryMessage = function(content) {
  let headers = createBaseHeader("audio");
  
  let headersArray = new Buffer(headers);

  let buffer = new ArrayBuffer(2 + headersArray.length + riff.length);

  let sizeDataView = new DataView(buffer, 0, 2);
  let headersDataView = new DataView(buffer, 2, headersArray.length);
  let contentDataView = new DataView(buffer,
    2 + headersArray.length,
    riff.length);

  sizeDataView.setUint16(0, headersArray.length);

  for(let i = 0; i < headersArray.length; i++) {
    headersDataView.setUint8(i, headersArray[i]);
  }

  for(let i = 0; i < riff.length; i++) {
    contentDataView.setUint8(i, riff[i]);
  }

  return buffer;
}

const buildRiffMessage = function() {
  return buildBinaryMessage(riff);
}

module.exports = class SpeechToTextClient {

  constructor(key) {
    this.key = key;
    this.TOKEN_ENDPOINT = 'https://api.cognitive.microsoft.com/sts/v1.0/issueToken';
    this.SPEECH_PATH = '/speech/recognition/dictation/cognitiveservices/v1';
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
    return this.renewToken()
        .then(token => {
          return new Promise((resolve, reject) => {

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

              this.wsc.send(buildRiffMessage(), resolve);

            });

            this.wsc.on('close', (...args) => console.log("closed with code", args));

            this.wsc.on('message', (...args) => {
              let message = args[0];
              if(message.indexOf("turn.phase") >= 0) {
                console.log("message: ", args);
              }
            });
          });
        })
        .catch(e => {
          console.log("couldn't connect to service", e);
        });
  }

  send(buffer) {
    this.wsc.send(buildBinaryMessage(buffer));
  }

  close() {
    try {
      this.wsc.terminate();
    } catch (e) {
      console.log(e);
    }
  }
}
