var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session')


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({secret: 'keyboard cat'}));


app.get('/', restrict,
function(req, res) {
  console.log(req.session);
  res.render('index');
});

app.get('/create', restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.get('/logout', function(req, res){
    req.session.destroy(function(){
        res.redirect('/');
    });
});

app.post('/signup', function(req, res){
  var userBody = req.body;

  var user = new User({
    username: userBody.username,
    password: userBody.password
  });
  user.save().then(function(newUser) {
    Users.add(newUser);
  }).then(function(newUser){
    loginUser(req, res);
  });
});

app.post('/login', function(req, res){
  loginUser(req, res);
});

app.post('/links',
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

function restrict(req, res, next) {
  if (req.session.user) {
    // if req.session.user
    next();
  } else {
    // req.session.error = 'Access denied!'; // only trigger if req.session.user
    res.redirect('/login');
  }
};

function loginUser(req, res){
  // query users for req.username, get back password
  // check req.password against stored password
  db.knex('users')
    .where('username', '=' , req.body.username)
    .then(function(users) {
      console.log(users);
      if ((users.length > 0) && (users['0']['password'] === req.body.password)) {
        req.session.regenerate(function(){
          req.session.user = req.body.username;
          res.redirect('/');
        });
      } else {
       res.redirect('/login');
      }
    });
}

app.get('/login',
function(req, res) {
  res.render('login');
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
