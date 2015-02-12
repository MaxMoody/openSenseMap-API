var restify = require('restify'),
  mongoose = require('mongoose'),
  timestamp = require('mongoose-timestamp'),
  fs = require('fs'),
  GeoJSON = require('geojson'),
  _ = require('lodash'),
  products = require('./products'),
  cfg = require('./config');
var Logger = require('bunyan'),
  log = new Logger.createLogger({
    name: 'OSeM-API',
    streams: [{
      path: './request.log'
    }],
    serializers: {
      req: Logger.stdSerializers.req
    }
  });


var server = restify.createServer({
  name: 'opensensemap-api',
  version: '0.0.1',
  log: log
});
server.use(restify.CORS({'origins': ['http://localhost', 'https://opensensemap.org']}));
server.use(restify.fullResponse());
server.use(restify.queryParser());
server.use(restify.bodyParser());

conn = mongoose.connect("mongodb://localhost/OSeM-api",{
  user: cfg.dbuser,
  pass: cfg.dbuserpass
});
var Schema = mongoose.Schema,
  ObjectId = Schema.ObjectID;

//Location schema
var LocationSchema = new Schema({
  type: {
    type: String,
    required: true,
    default: "Feature"
  },
  geometry: {
    type: {
      type: String,
      required: true,
      default:"Point"
    },
    coordinates: {
      type: Array,
      required: true
    }
  },
  properties: Schema.Types.Mixed
});

LocationSchema.index({ 'geometry' : '2dsphere' });

var measurementSchema = new Schema({
  value: {
    type: String,
    required: true
  },
  sensor_id: {
    type: Schema.Types.ObjectId,
    ref: 'Sensor',
    required: true
  }
});

measurementSchema.plugin(timestamp);

//Sensor schema
var sensorSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  unit: {
    type: String,
    required: true,
    trim: true
  },
  sensorType: {
    type: String,
    required: false,
    trim: true
  },
  lastMeasurement: {
    type: Schema.Types.ObjectId,
    ref: 'Measurement'
  }
});

//SenseBox schema
var boxSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  loc: {
    type: [LocationSchema],
    required: true
  },
  boxType: {
    type: String,
    required: true
  },
  exposure: {
    type: String,
    required: false
  },
  grouptag: {
    type: String,
    required: false
  },
  sensors: [sensorSchema]
},{ strict: false });

var userSchema = new Schema({
  firstname: {
    type: String,
    required: true,
    trim: true
  },
  lastname: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true
  },
  apikey: {
    type: String,
    trim: true
  },
  boxes: [
    {
      type: String,
      trim: true
    }
  ]
});

var Measurement = mongoose.model('Measurement', measurementSchema);
var Box = mongoose.model('Box', boxSchema);
var Sensor = mongoose.model('Sensor', sensorSchema);
var User = mongoose.model('User', userSchema);

var PATH = '/boxes';
var userPATH = 'users';

server.pre(function (request,response,next) {
  request.log.info({req: request}, 'REQUEST');
  next();
});

server.get({path : PATH , version : '0.0.1'} , findAllBoxes);
server.get({path : /(boxes)\.([a-z]+)/, version : '0.0.1'} , findAllBoxes);
server.get({path : PATH +'/:boxId' , version : '0.0.1'} , findBox);
server.get({path : PATH +'/:boxId/sensors', version : '0.0.1'}, getMeasurements);

server.post({path : PATH , version: '0.0.1'} ,postNewBox);
server.post({path : PATH +'/:boxId/:sensorId' , version : '0.0.1'}, postNewMeasurement);

server.put({path: PATH + '/:boxId' , version: '0.0.1'} , updateBox);

server.get({path : userPATH +'/:boxId', version : '0.0.1'}, validApiKey);

function unknownMethodHandler(req, res) {
  if (req.method.toLowerCase() === 'options') {
    var allowHeaders = ['Accept', 'X-ApiKey', 'Accept-Version', 'Content-Type', 'Api-Version', 'Origin', 'X-Requested-With']; // added Origin & X-Requested-With

    if (res.methods.indexOf('OPTIONS') === -1) res.methods.push('OPTIONS');

    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Headers', allowHeaders.join(', '));
    res.header('Access-Control-Allow-Methods', res.methods.join(', '));
    res.header('Access-Control-Allow-Origin', req.headers.origin);

    return res.send(204);
  }
  else
    return res.send(new restify.MethodNotAllowedError());
}

server.on('MethodNotAllowed', unknownMethodHandler);

function validApiKey (req,res,next) {
  User.findOne({apikey:req.headers['x-apikey']}, function (error, user) {
    if (error) {
      res.send(400, 'ApiKey not existing!');
    }

    if (user.boxes.indexOf(req.params.boxId) != -1) {
      res.send(200,'ApiKey is valid!');
    } else {
      res.send(400,'ApiKey is invalid!');
    }
  });
}

function decodeBase64Image(dataString) {
  var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
    response = {};

  if (matches.length !== 3) {
    return new Error('Invalid input string');
  }

  response.type = matches[1];
  response.data = new Buffer(matches[2], 'base64');

  return response;
}

function updateBox(req, res, next) {
  //TODO check apikey
  Box.findById(req.params.boxId, function (err, box) {
    if (err) return handleError(err);
    var data = req.params.image.toString();
    var imageBuffer = decodeBase64Image(data);
    console.log(cfg.imageFolder);
    fs.writeFile(cfg.imageFolder+""+req.params.boxId+'.jpeg', imageBuffer.data, function(err){
      if (err) return new Error(err);
      box.set({image:cfg.imageFolder+""+req.params.boxId+'.jpeg'});
      box.save(function (err) {
        if (err) return handleError(err);
        res.send(box);
      });
    });
  });
}

function getMeasurements(req, res, next) {
  Box.findOne({_id: req.params.boxId},{sensors:1}).populate('sensors.lastMeasurement').exec(function(error,sensors){
    if (error) {
      return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)));
    } else {
      res.send(201,sensors);
    }
  });
}

function postNewMeasurement(req, res, next) {
  Box.findOne({_id: req.params.boxId}, function(error,box){
    if (error) {
      return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)));
    } else {
      for (var i = box.sensors.length - 1; i >= 0; i--) {
        if (box.sensors[i]._id.equals(req.params.sensorId)) {

          var measurementData = {
            value: req.params.value,
            _id: mongoose.Types.ObjectId(),
            sensor_id: req.params.sensorId
          };

          var measurement = new Measurement(measurementData);

          box.sensors[i].lastMeasurement = measurement._id;
          box.save(function(error,data){
            if (error) {
              return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)));
            } else {
              res.send(201,'measurement saved in box');
            }
          });

          measurement.save(function(error, data, box){
            if (error) {
              return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)));
            } else {
              res.send(201,measurement);
            }
          });
        }
      };
    }
  });
}

function findAllBoxes(req, res , next){
  Box.find({}).populate('sensors.lastMeasurement').exec(function(err,boxes){
    if (req.params[1] === "json" || req.params[1] === undefined) {
      res.send(boxes);
    } else if (req.params[1] === "geojson") {
      tmp = JSON.stringify(boxes);
      tmp = JSON.parse(tmp);
      var geojson = _.transform(tmp, function(result, n) {
        lat = n.loc[0].geometry.coordinates[1];
        lng = n.loc[0].geometry.coordinates[0];
        delete n["loc"];
        n["lat"] = lat;
        n["lng"] = lng;
        return result.push(n);
      });
      res.send(GeoJSON.parse(geojson, {Point: ['lat','lng']}));
    }
  });
}

function findBox(req, res, next) {
  id = req.params.boxId.split(".")[0];
  format = req.params.boxId.split(".")[1];
  if (isEmptyObject(req.query)) {
    Box.findOne({_id: id}).populate('sensors.lastMeasurement').exec(function(error,box){
      if (error) return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)));
      if (box) {
        if (format === "json" || format === undefined) {
          res.send(box);
        } else if (format === "geojson") {
          tmp = JSON.stringify(box);
          tmp = JSON.parse(tmp);
          lat = tmp.loc[0].geometry.coordinates[1];
          lng = tmp.loc[0].geometry.coordinates[0];
          delete tmp["loc"];
          tmp["lat"] = lat;
          tmp["lng"] = lng;
          geojson = [tmp];
          res.send(GeoJSON.parse(geojson, {Point: ['lat','lng']}));
        }
      } else {
        res.send(404);
      }
    });
  } else{
    res.send(box);
  }
}

function createNewUser (req) {
  var userData = {
    firstname: req.params.user.firstname,
    lastname: req.params.user.lastname,
    email: req.params.user.email,
    apikey: req.params.orderID,
    boxes: []
  }

  var user = new User(userData);

  return user;
}

function createNewBox (req) {
  var boxData = {
    name: req.params.name,
    boxType: req.params.boxType,
    loc: req.params.loc,
    grouptag: req.params.tag,
    exposure: req.params.exposure,
    _id: mongoose.Types.ObjectId(),
    sensors: []
  };

  var box = new Box(boxData);

  if (req.params.model) {
    switch(req.params.model){
      case 'senseboxhome2014':
        req.params.sensors = products.senseboxhome2014;
        break;
      case 'senseboxhome2015':
        req.params.sensors = products.senseboxhome2015;
        break;
      case 'senseboxphotonikwifi':
        req.params.sensors = products.senseboxphotonikwifi;
        break;
      case 'senseboxphotonikethernet':
        req.params.sensors = products.senseboxphotonikethernet;
        break;
      default:
        break;
    }
  }

  for (var i = req.params.sensors.length - 1; i >= 0; i--) {
    var id = mongoose.Types.ObjectId();

    var sensorData = {
      _id: id,
      title: req.params.sensors[i].title,
      unit: req.params.sensors[i].unit,
      sensorType: req.params.sensors[i].sensorType,
    };

    box.sensors.push(sensorData);
  };

  return box;
}

function postNewBox(req, res, next) {
  User.findOne({apikey:req.params.orderID}, function (err, user) {
    if (!user) {
      var newUser = createNewUser(req);
      var newBox = createNewBox(req);

      newUser._doc.boxes.push(newBox._doc._id.toString());
      newBox.save( function (err, box) {
        if (err) {
          return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)));
        }

        switch(req.params.model){
          case 'senseboxhome2014':
            filename = "files/template_home/template_home_2014/template_home_2014.ino";
            break;
          case 'senseboxhome2015':
            filename = "files/template_home/template_home_2015/template_home_2015.ino";
            break;
          case 'senseboxphotonikwifi':
            filename = "files/template_photonik/template_photonik_wifi/template_photonik_wifi.ino";
            break;
          case 'senseboxphotonikethernet':
            filename = "files/template_photonik/template_photonik_ethernet/template_photonik_ethernet.ino";
            break;
          default:
            break;
        }

        fs.readFileSync(filename).toString().split('\n').forEach(function (line) {
          var output = cfg.targetFolder+""+box._id+".ino";
          if (line.indexOf("//SenseBox ID") != -1) {
            fs.appendFileSync(output, line.toString() + "\n");
            fs.appendFileSync(output, '#define SENSEBOX_ID "'+box._id+'"\n');
          } else if (line.indexOf("//Sensor IDs") != -1) {
            fs.appendFileSync(output, line.toString() + "\n");
            for (var i = box.sensors.length - 1; i >= 0; i--) {
              var sensor = box.sensors[i];
              if (sensor.title == "Temperatur") {
                fs.appendFileSync(output, '#define TEMPERATURESENSOR_ID "'+sensor._id+'"\n');
              } else if(sensor.title == "rel. Luftfeuchte") {
                fs.appendFileSync(output, '#define HUMIDITYSENSOR_ID "'+sensor._id+'"\n');
              } else if(sensor.title == "Luftdruck") {
                fs.appendFileSync(output, '#define PRESSURESENSOR_ID "'+sensor._id+'"\n');
              } else if(sensor.title == "Lautstärke") {
                fs.appendFileSync(output, '#define NOISESENSOR_ID "'+sensor._id+'"\n');
              } else if(sensor.title == "Helligkeit") {
                fs.appendFileSync(output, '#define LIGHTSENSOR_ID "'+sensor._id+'"\n');
              } else if (sensor.title == "Beleuchtungsstärke") {
                fs.appendFileSync(output, '#define LUXSENSOR_ID "'+sensor._id+'"\n');
              } else if (sensor.title == "UV") {
                fs.appendFileSync(output, '#define UVSENSOR_ID "'+sensor._id+'"\n');
              };
            };
          } else {
            fs.appendFileSync(output, line.toString() + "\n");
          }
        });

        newUser.save( function (err, user) {
          if (err) {
            return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)));
          }
          res.send(201, user);
        });
      });
    }
  });
}

function isEmptyObject(obj) {
  return !Object.keys(obj).length;
}

server.listen(8000, function () {
  console.log('%s listening at %s', server.name, server.url);
});