const path = require('path');

module.exports = {
  "vidnoz": {
    "pathname": path.join(process.env.PROJECT_PATH || "D:\\PROJECT"),
    "domain": "yinchuanbo.vidnoz.com",
    "lans": {
      "en": "pc.makevideoclip.com",
      "jp": "jp.makevideoclip.com",
      "it": "it.makevideoclip.com",
      "fr": "fr.makevideoclip.com",
      "de": "de.makevideoclip.com",
      "ar": "ar.makevideoclip.com",
      "pt": "pt.makevideoclip.com",
      "es": "es.makevideoclip.com",
      "kr": "kr.makevideoclip.com",
      "nl": "nl.makevideoclip.com",
      "tr": "tr.makevideoclip.com",
      "tw": "tw.makevideoclip.com"
    },
    "ports": {
      "en": "9292",
      "jp": "9090",
      "it": "8888",
      "fr": "8989",
      "de": "8585",
      "ar": "9191",
      "pt": "8787",
      "es": "8686",
      "kr": "9696",
      "nl": "9797",
      "tr": "9898",
      "tw": "9999"
    }
  }
};
