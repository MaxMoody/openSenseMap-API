'use strict';

let jsonPath = require('jsonpath');

module.exports = {
  decodeMessage: function (message, options) {
    if (message && options && options.jsonPath) {
      let json;
      try {
        json = JSON.parse(message);
      } catch (err) {
        console.log(err);
      }

      if (typeof json !== 'undefined') {
        let result = jsonPath.query(json, options.jsonPath, 1);

        if (result[0]) {
          return result[0];
        }
      }
    }
  }
};
