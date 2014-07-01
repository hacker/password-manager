var BUNYAN = require('bunyan');
var LOGGER = BUNYAN.createLogger({
 name: 'clipperz',
 streams: [
  { name: "console", stream:process.stderr,level:'trace'}
 ],
 serializers: {
  req: BUNYAN.stdSerializers.req,
  res: BUNYAN.stdSerializers.res,
  err: BUNYAN.stdSerializers.err
 },
 src: true
});


var EXPRESS = require('express');
var HTTP = require('http');
var PATH = require('path');


var CLIPPERZ = require('./clipperz');
var CONF = require('./conf');
var clipperz = CLIPPERZ({
 psql: CONF.psql||'postgresql:///clipperz',
 logger: LOGGER,
 dump_template: PATH.join(__dirname,'htdocs/beta/index.html')
});


var app = EXPRESS();

app.set('port', process.env.PORT || 3000);
app.use(require('morgan')('dev'));
app.use(require('body-parser').urlencoded({extended:true}));
app.use(require('cookie-parser')('your secret here'));
app.use(require('express-session')({secret:'99 little bugs in the code', key:'sid', store: clipperz.session_store(), resave: false, saveUninitialized: false }));

/* Like this: */
app.use(clipperz.router);
/* Or this: */
app.use('/clz/',clipperz.router);

if ('development' == app.get('env')) {
  app.use(require('express-error-with-sources')());
}




HTTP.createServer(app).listen(app.get('port'), function(){
 LOGGER.info({port:app.get('port')},"Listener established");
});
