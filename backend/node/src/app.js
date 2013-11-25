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
app.use(EXPRESS.logger('dev'));
app.use(EXPRESS.urlencoded());
app.use(EXPRESS.methodOverride());
app.use(EXPRESS.cookieParser('your secret here'));
app.use(EXPRESS.session({secret:'99 little bugs in the code', key:'sid', store: clipperz.session_store() }));
app.use(app.router);
app.use(EXPRESS.static(PATH.join(__dirname, 'htdocs/')));
if ('development' == app.get('env')) {
  app.use(EXPRESS.errorHandler());
}


app.post('/json',clipperz.json);
app.get('/beta/dump',clipperz.dump);


HTTP.createServer(app).listen(app.get('port'), function(){
 LOGGER.info({port:app.get('port')},"Listener established");
});
