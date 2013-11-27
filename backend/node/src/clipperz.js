var FS = require('fs');
var CRYPTO = require('crypto');
var BIGNUM = require('bignum');
var ASYNC = require('async');

var express_store = require('express').session.Store;

function clipperz_hash(v) {
 return CRYPTO.createHash('sha256').update(
  CRYPTO.createHash('sha256').update(v).digest('binary')
 ).digest('hex');
};
function clipperz_random() {
 for(var r = '';r.length<64;r+=''+BIGNUM(Math.floor(Math.random()*1e18)).toString(16));
 return r.substr(0,64);
};
function clipperz_store(PG) {
 var rv = function(o) { express_store.call(this,o); }
 rv.prototype.get = function(sid,cb) { PG.Q(
  "SELECT s_data FROM clipperz.thesession WHERE s_id=$1",[sid],
  function(e,r) { cb(e,(e||!r.rowCount)?null:JSON.parse(r.rows[0].s_data)); }
 ) };
 rv.prototype.set = function(sid,data,cb) {
  var d = JSON.stringify(data);
  PG.Q(
    "UPDATE clipperz.thesession SET s_data=$1, s_mtime=current_timestamp"
   +" WHERE s_id=$2",[d,sid], function(e,r) {
   if(e) return cb(e);
   if(r.rowCount) return cb();
   PG.Q("INSERT INTO clipperz.thesession (s_id,s_data) VALUES ($1,$2)",[sid,d],cb);
  });
 };
 rv.prototype.destroy = function(sid,cb) { PG.Q(
  "DELETE FROM clipperz.thesession WHERE s_id=$1",[sid],cb
 ) };
 rv.prototype.length = function(cb) { PG.Q(
  "SELECT count(*) AS c FROM clipperz.thesession", function(e,r) {
     cb(e,e?null:r.rows[0].c);
  }
 ) };
 rv.prototype.length = function(cb) { PQ.Q(
  "DELETE FROM clipperz.thesession", cb
 ) };
 rv.prototype.__proto__ = express_store.prototype;
 return rv;
}

var srp_g = BIGNUM(2);
var srp_n = BIGNUM("115b8b692e0e045692cf280b436735c77a5a9e8a9e7ed56c965f87db5b2a2ece3",16);
var n123 = '112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00';


var CLIPPERZ = module.exports = function(CONFIG) {

 var LOGGER = CONFIG.logger||{trace:function(){}};

 var PG = {
  url: CONFIG.psql,
  PG: require('pg').native,
  Q: function(q,a,cb) {
   if('function'===typeof a) cb=a,a=[];
   LOGGER.trace({query:q,args:a},'SQL: %s',q);
   PG.PG.connect(PG.url,function(e,C,D) {
	if(e) return cb(e);
	var t0=new Date();
	C.query(q,a,function(e,r) {
	 var t1=new Date(), dt=t1-t0;
	 D();
	 LOGGER.trace({query:q,args:a,ms:dt,rows:r&&r.rowCount,err:e},"SQL query '%s' took %dms",q,dt);
	 cb(e,r);
	});
   });
  },
  T: function(cb) {
   PG.PG.connect(PG.url,function(e,C,D) {
	if(e) return cb(e);
	C.query('BEGIN',function(e){
	 if(e) return D(),cb(e);
	 LOGGER.trace('SQL: transaction begun');
	 cb(null,{
	  Q: function(q,a,cb) {
	   LOGGER.trace({query:q,args:a},'SQL: %s',q);
	   if(this.over) return cb(new Error('game over'));
	   if('function'===typeof a) cb=a,a=[];
	   var t0=new Date();
	   C.query(q,a,function(e,r) {
		var t1=new Date(), dt=t1-t0;
		LOGGER.trace({query:q,args:a,ms:dt,rows:r&&r.rowCount,err:e},"SQL query '%s' took %dms",q,dt);
		cb(e,r);
	   });
	  },
	  commit: function(cb) {
	   LOGGER.trace('SQL: commit');
	   if(this.over) return cb(new Error('game over'));
	   return (this.over=true),C.query('COMMIT',function(e){D();cb&&cb(e)});
	  },
	  rollback: function(cb) {
	   LOGGER.trace('SQL: rollback');
	   if(this.over) return cb(new Error('game over'));
	   return (this.over=true),C.query('ROLLBACK',function(e){D();cb&&cb(e)});
	  },
	  end: function(e,cb) {
	   if(e) return LOGGER.trace(e,"rolling back transaction due to an error"),this.rollback(cb);
	   this.commit(cb);
	  }
	 });
	});
   });
  }
 };


 var rv = {

  json: function clipperz_json(req,res,cb) {
   var method = req.body.method, pp = JSON.parse(req.body.parameters).parameters;
   var message = pp.message;
   var ppp = pp.parameters;
   res.res = function(o) { return res.json({result:o}) };
   LOGGER.trace({method:method,parameters:pp},"JSON request");

   switch(method) {
    case 'registration':
     switch(message) {
      case 'completeRegistration': return PG.Q(
	"INSERT INTO clipperz.theuser"
       +" (u_name, u_srp_s,u_srp_v, u_authversion,u_header,u_statistics,u_version,u_lock)"
       +" VALUES ($1, $2,$3, $4,$5,$6,$7,$8)",
       [pp.credentials.C, pp.credentials.s, pp.credentials.v,
	pp.credentials.version,pp.user.header, pp.user.statistics,
	pp.user.version, pp.user.lock], function(e,r) {
	if(e) return cb(e);
	res.res({lock:pp.user.lock,result:'done'});
       });
     }
    break;

    case 'handshake':
     switch(message) {
      case 'connect': return ASYNC.auto({
       u: function(cb) { PG.Q(
	"SELECT u_id, u_srp_s, u_srp_v FROM clipperz.theuser WHERE u_name=$1",
	[ppp.C], function(e,r) {
	if(e) return cb(e);
	if(!r.rowCount) return cb(null,{u_id:null,u_srp_s:n123,u_srp_v:n123});
	cb(null,r.rows[0]);
       }) },
       otp: ['u',function(cb,r) {
	if(!req.session.otp) return cb();
	if(req.session.u!=r.u.u_id) return cb(new Error('user/OTP mismatch'));
	PG.Q(
	  "UPDATE clipperz.theotp AS otp"
	 +" SET"
	 +"  otps_id=CASE WHEN s.otps_code='REQUESTED' THEN ("
	 +"   SELECT ss.otps_id FROM clipperz.otpstatus AS ss WHERE ss.otps_code='USED'"
	 +"  ) ELSE otp.otps_id END,"
	 +"  otp_utime=current_timestamp"
	 +" FROM clipperz.otpstatus AS s, clipperz.theotp AS o"
	 +" WHERE"
	 +"  o.otp_id=otp.otp_id AND otp.otps_id=s.otps_id"
	 +"  AND otp.otp_id=$1 AND otp.u_id=$2"
	 +" RETURNING o.otps_id!=otp.otps_id AS yes, o.otp_ref",
	 [ req.session.otp, req.session.u ],
	 function(e,r) {
	 if(e) return cb(e);
	 if(!r.rowCount) return cb(new Error('no OTP found'));
	 r=r.rows[0];
	 if(!r.yes) return cb(new Error('OTP is in a sorry state'));
	 cb(null,{ref:r.otp_ref});
	});
       }]
      },function(e,r) {
       if(e) return cb(e);
       req.session.C = ppp.C; req.session.A = ppp.A;
       req.session.s = r.u.u_srp_s; req.session.v = r.u.u_srp_v;
       req.session.u = r.u.u_id;
       req.session.b = clipperz_random();
       req.session.B = BIGNUM(req.session.v,16).add(srp_g.powm(BIGNUM(req.session.b,16),srp_n)).toString(16);
       var rv = {s:req.session.s,B:req.session.B}
       if(r.otp && r.otp.otp_ref) rv.oneTimePassword=r.otp.otp_ref;
       res.res(rv);
      });
 
      case 'credentialCheck':
       var u = clipperz_hash(BIGNUM(req.session.B,16).toString(10));
       var A = BIGNUM(req.session.A,16);
       var S = A.mul(BIGNUM(req.session.v,16).powm(BIGNUM(u,16),srp_n)).powm(
		BIGNUM(req.session.b,16), srp_n);
       var K = clipperz_hash(S.toString(10));
       var M1 = clipperz_hash(A.toString(10)+BIGNUM(req.session.B,16).toString(10)+K.toString(16));
       if(M1!=ppp.M1) return res.res({error:'?'});
       req.session.K = K;
       var M2 = clipperz_hash(A.toString(10)+M1+K.toString(16));
       return res.res({M2:M2,connectionId:'',loginInfo:{latest:{},current:{}},offlineCopyNeeded:false,lock:'----'});

      case 'oneTimePassword': return PG.Q(
	"UPDATE clipperz.theotp AS otp"
       +" SET"
       +"  otps_id = CASE WHEN s.otps_code!='ACTIVE' THEN s.otps_id ELSE ("
       +"   SELECT ss.otps_id FROM clipperz.otpstatus AS ss WHERE ss.otps_code=CASE"
       +"    WHEN otp.otp_key_checksum=$2 THEN 'REQUESTED'"
       +"    ELSE 'DISABLED' END"
       +"  ) END,"
       +"  otp_data = CASE WHEN s.otps_code='ACTIVE' THEN '' ELSE otp.otp_data END,"
       +"  otp_utime = current_timestamp,"
       +"  otp_rtime = CASE WHEN otp.otp_key_checksum=$2 THEN current_timestamp ELSE otp.otp_rtime END"
       +" FROM clipperz.otpstatus AS s, clipperz.theotp AS o"
       +" WHERE"
       +"  o.otp_id=otp.otp_id AND otp.otps_id=s.otps_id AND otp.otp_key=$1"
       +" RETURNING otp.u_id, s.otps_code, otp.otp_id, otp.otp_key_checksum, o.otp_data, otp.otp_version",
       [ ppp.oneTimePasswordKey, ppp.oneTimePasswordKeyChecksum ],
       function(e,r) {
       if(e) return cb(e);
       if(!r.rowCount) return cb(new Error('OTP not found'));
       r=r.rows[0];
       if(r.otp_key_checksum!=ppp.oneTimePasswordKeyChecksum)
	return cb(new Error('OTP was disabled because of checksum mismatch'));
       if(r.otps_code!='ACTIVE')
	return cb(new Error("OTP wasn't active, sorry"));
       req.session.u=r.u_id; req.session.otp=r.otp_id;
       res.res({data:r.otp_data,version:r.otp_version});
      });
     }
    break;

    case 'message':
     if(!req.session.K) return res.res({result:'EXCEPTION',message:"effectively, we're missing a aconnection"});
     if(req.session.K!=pp.srpSharedSecret) return res.res({error:'Wrong shared secret!'});
     switch(message) {
      case 'getUserDetails': return ASYNC.parallel({
       u: function(cb) {
	PG.Q("SELECT u_header,u_statistics,u_version FROM clipperz.theuser WHERE u_id=$1",
	 [req.session.u],function(e,r) {
	 if(e) return cb(e);
	 if(!r.rowCount) return cb(new Error("user's gone AWOL"));
	 cb(null,r.rows[0]);
	});
       },
       stats: function(cb) {
	PG.Q("SELECT r_ref,r_mtime FROM clipperz.therecord WHERE u_id=$1",
	 [req.session.u],function(e,r) {
	 if(e) return cb(e);
	 cb(null,r.rows.reduce(function(p,r){p[r.r_ref]={updateDate:r.r_mtime};return p},{}));
	});
       }
      },function(e,r) {
       if(e) return cb(e);
       res.res({header:r.u.u_header,statistics:r.u.u_statistics,version:r.u.u_version,recordsStats:r.stats});
      });

      case 'saveChanges': return PG.T(function(e,T) {
       if(e) return cb(e);
       ASYNC.auto({
	user: function(cb) {
	 T.Q(
	   "UPDATE clipperz.theuser"
	  +" SET u_header=$1, u_statistics=$2, u_version=$3, u_lock=COALESCE($4,u_lock)"
	  +" WHERE u_id=$5"
	  +" RETURNING u_lock",[ppp.user.header,ppp.user.statistics,ppp.user.version,ppp.user.lock||null,req.session.u],
	  function(e,r) {
	  if(e) return cb(e);
	  if(!r.rowCount) return cb(new Error("user's gone AWOL"));
	  cb(null,r.rows[0]);
	 });
	},
	updaterecords: function(cb) {
	 if(!(ppp.records && ppp.records.updated && ppp.records.updated.length)) return cb();
	 ASYNC.each(ppp.records.updated,function(r,cb) {
	  ASYNC.auto({
	   updater: function(cb) {
	    T.Q(
	      "UPDATE clipperz.therecord"
	     +" SET r_data=$2, r_version=$3, r_mtime=current_timestamp"
	     +" WHERE r_ref=$1 AND u_id=$4 RETURNING r_id",
	     [r.record.reference,r.record.data,r.record.version,req.session.u], function(e,r) {
	     if(e) return cb(e);
	     return cb(null,r.rows.length?r.rows[0]:null);
	    });
	   },
	   insertr: ['updater',function(cb,rr) {
	    if(rr.updater) return cb();
	    T.Q(
	      "INSERT INTO clipperz.therecord"
	     +" (u_id,r_ref,r_data,r_version)"
	     +" VALUES ($1,$2,$3,$4) RETURNING r_id",[req.session.u,r.record.reference,r.record.data,r.record.version],
	     function(e,r) {
	     if(e) return cb(e);
	     return cb(null,r.rows[0]);
	    });
	   }],
	   updatev: ['updater','insertr',function(cb,rr) {
	    var crv=r.currentRecordVersion;
	    T.Q(
	      "UPDATE clipperz.therecordversion"
	     +" SET rv_ref=$1, rv_data=$2, rv_version=$3,"
	     +"  rv_previous_id=COALESCE($4,rv_previous_id),"
	     +"  rv_previous_key=$5, r_id=$6, rv_mtime=current_timestamp"
	     +" WHERE"
	     +"  rv_id=(SELECT rv_id FROM clipperz.therecordversion WHERE r_id=$6 ORDER BY r_id ASC LIMIT 1)"
	     +" RETURNING rv_id",
	     [crv.reference,crv.data,crv.version,
	      crv.previousVersion||null,crv.previousVersionKey,
	      (rr.updater||rr.insertr).r_id],
	     function(e,r) {
	     if(e) return cb(e);
	     return cb(null,r.rows.length?r.rows[0]:null);
	    });
	   }],
	   insertv: ['updatev',function(cb,rr) {
	    if(rr.updatev) return cb();
	    var crv=r.currentRecordVersion;
	    T.Q(
	      "INSERT INTO clipperz.therecordversion"
	     +" (r_id,rv_ref,rv_data,rv_version,rv_previous_id,rv_previous_key)"
	     +" VALUES ($1,$2,$3,$4,$5,$6) RETURNING rv_id",
	     [(rr.updater||rr.insertr).r_id,
	      crv.reference, crv.data, crv.version,
	      crv.previousVersion||null,crv.previousVersionKey],
	     function(e,r) {
	     if(e) return cb(e);
	     return cb(null,r.rows[0]);
	    });
	   }]
	  },cb);
	 },cb);
	},
	deleterecords: function(cb) {
	 if(!(ppp.records && ppp.records.deleted && ppp.records.deleted.length)) return cb();
	 T.Q(
	   "DELETE FROM clipperz.therecord"
	  +" WHERE r_ref = ANY($1::text[]) AND u_id=$2",
	  [ '{'+ppp.records.deleted.join(',')+'}', req.session.u ], cb);
	}
       },function(e,r) {
	T.end(e, function(e) {
	 if(e) return cb(e);
	 res.res({result:'done',lock:r.user.u_lock});
	});
       });
      });

      case 'getRecordDetail': return ASYNC.auto({ // TODO: could be done in one query instead
       record: function(cb) {
	PG.Q(
	 "SELECT r_id,r_ref,r_data,r_version, r_ctime, r_mtime, r_atime FROM clipperz.therecord WHERE r_ref=$1",
	 [ppp.reference],function(e,r) {
	  if(e) return cb(e);
	  if(!r.rowCount) return cb(new Error('no record found'));
	  return cb(null,r.rows[0]);
	});
       },
       version: ['record',function(cb,r) {
	PG.Q(
	  "SELECT rv_ref, rv_data, rv_header, rv_version, rv_ctime, rv_mtime, rv_atime"
	 +" FROM clipperz.therecordversion WHERE r_id=$1 ORDER BY rv_id ASC LIMIT 1",
	 [r.record.r_id],function(e,r) {
	 if(e) return cb(e);
	 if(!r.rowCount) return cb(new Error('no record version found'));
	 return cb(null,r.rows[0]);
	});
       }]
      },function(e,r) {
       if(e) return cb(e);
       var v = {};
       v[r.version.rv_ref] = {
	reference: r.version.rv_ref,
	data: r.version.rv_data, header: r.version.rv_header,
	version: r.version.rv_version,
	creationDate: r.version.rv_ctime, updateDate: r.version.rv_mtime, accessDate: r.version.rv_atime
       };
       res.res({ versions: v, currentVersion: r.version.rv_ref, reference: r.record.r_ref,
	data: r.record.r_data, version: r.record.r_version,
	creationDate: r.record.r_ctime, updateDate: r.record.r_mtime, accessDate: r.record.r_atime,
	oldestUsedEncryptedVersion: '---' });
      });

      case 'addNewOneTimePassword': return PG.T(function(e,T) {
       if(e) return cb(e);
       ASYNC.parallel({
	otp: function(cb) {
	 var otp = ppp.oneTimePassword;
	 T.Q(
	   "INSERT INTO clipperz.theotp"
	  +" (u_id,otp_ref,otp_key,otp_key_checksum,otp_data,otp_version,otps_id)"
	  +" SELECT $1,$2,$3,$4,$5,$6,otps_id FROM clipperz.otpstatus"
	  +" WHERE otps_code='ACTIVE'",
	  [ req.session.u, otp.reference, otp.key, otp.keyChecksum,
	    otp.data, otp.version], function(e,r) {
	  if(e) return cb(e);
	  if(!r.rowCount) return cb(new Error('no user or status'));
	  cb();
	 });
	},
	user: function(cb) {
	 var u = ppp.user;
	 T.Q(
	   "UPDATE clipperz.theuser"
	  +" SET u_header=$1, u_statistics=$2, u_version=$3, u_lock=COALESCE($4,u_lock)"
	  +" WHERE u_id=$5",
	  [ u.header, u.statistics, u.version, u.lock||null, req.session.u],
	  function(e,r) {
	  if(e) return cb(e);
	  if(!r.rowCount) return cb(new Error("user's gone AWOL"));
	  cb();
	 });
	}
       },function(e,r) {
	T.end(e, function(e) {
	 if(e) return cb(e);
	 res.res({result:'done',lock:ppp.user.lock});
	});
       });
      });

      case 'updateOneTimePasswords': return PG.T(function(e,T) {
       if(e) return cb(e);
       ASYNC.parallel({
	otp: function(cb) {
	 T.Q(
	   "DELETE FROM clipperz.theotp"
	  +" WHERE u_id=$1"
	  +"  AND NOT otp_ref = ANY($2::text[])",
	  [ req.session.u,'{'+ppp.oneTimePasswords.join(',')+'}' ],cb);
	},
	user: function(cb) {
	 var u = ppp.user;
	 T.Q(
	   "UPDATE clipperz.theuser"
	  +" SET u_header=$1, u_statistics=$2, u_version=$3, u_lock=COALESCE($4,u_lock)"
	  +" WHERE u_id=$5",
	  [ u.header, u.statistics, u.version, u.lock||null, req.session.u],
	  function(e,r) {
	  if(e) return cb(e);
	  if(!r.rowCount) return cb(new Error("user's gone AWOL"));
	  cb();
	 });
	}
       },function(e,r) {
	T.end(e, function(e) {
	 if(e) return cb(e);
	 res.res({result:ppp.user.lock});
	});
       });
      });

      case 'upgradeUserCredentials': return PG.T(function(e,T) {
       if(e) return cb(e);
       ASYNC.parallel({
	user: function(cb) {
	 var u = ppp.user, c = ppp.credentials;
	 T.Q(
	   "UPDATE clipperz.theuser"
	  +" SET u_header=$1, u_statistics=$2, u_version=$3, u_lock=COALESCE($4,u_lock),"
	  +"  u_name=$5, u_srp_s=$6, u_srp_v=$7, u_authversion=$8"
	  +" WHERE u_id=$9 RETURNING u_lock",
	  [ u.header,u.statistics,u.version,u.lock||null,
	    c.C,c.s,c.v,c.version, req.session.u ],function(e,r) {
	  if(e) return cb(e);
	  if(!r.rowCount) return cb(new Error("user's gone AWOL"));
	  cb(e,r.rows[0]);
	 });
	},
	otp: function(cb) {
	 var otps=ppp.oneTimePasswords;
	 if(!otps) return cb();
	 ASYNC.each(Object.keys(otps),function(r,cb) {
	  T.Q(
	    "UPDATE clipperz.theotp"
	   +" SET otp_data=$1, otp_utime=current_timestamp WHERE otp_ref=$2 AND u_id=$3",
	   [ otps[r], r, req.session.u ], function(e,r) {
	   if(e) return cb(e);
	   if(!r.rowCount) return cb(new Error("OTP's gone AWOL"));
	   cb();
	  });
	 },cb);
	}
       },function(e,r) {
	T.end(e, function(e) {
	 if(e) return cb(e);
	 res.res({result:'done',lock:r.user.u_lock});
	});
       });
      });

      case 'deleteUser': return PG.Q(
       "DELETE FROM clipperz.theuser WHERE u_id=$1",
       [req.session.u],function(e,r) {
       if(e) return cb(e);
       res.res({result:'ok'});
      });

      case 'echo': return res.res({result:ppp});
      case 'getOneTimePasswordsDetails': return res.res({});
      case 'getLoginHistory': return res.res({result:[]});
     }
    break;
    case 'logout': return req.session.destroy(function(e){res.res({})});
   }
   cb();
  },

  dump: function(req,res,cb) {
   if(!req.session.u) return cb(new Error('logging in helps'));
   return ASYNC.parallel({
    u: function(cb) {
     PG.Q(
       "SELECT"
      +" u_name, u_srp_s, u_srp_v, u_authversion, u_header, u_statistics, u_version"
      +" FROM clipperz.theuser WHERE u_id=$1",[req.session.u],function(e,r) {
      if(e) return cb(e);
      if(!r.rowCount) return cb(new Error("user's gone AWOL"));
      r = r.rows[0];
      return cb(null,{u:r.u_name,d:{s:r.u_srp_s,v:r.u_srp_v, version:r.u_authversion,
       maxNumberOfRecords: '100', userDetails: r.u_header,
       statistics: r.u_statistics, userDetailsVersion: r.u_version
      }});
     });
    },
    records: function(cb) {
     PG.Q(
       "SELECT"
      +"  r.r_id, r.r_ref, r_data, r_version, r_ctime, r_mtime, r_atime,"
      +"  rv.rv_id, rv.rv_ref AS rv_ref, rv_header, rv_data, rv_version, rv_ctime, rv_mtime, rv_atime"
      +" FROM"
      +"  clipperz.therecord AS r"
      +"  LEFT JOIN clipperz.therecordversion AS rv USING (r_id)"
      +" WHERE r.u_id=$1"
      +" ORDER BY r.r_id ASC, rv.rv_id ASC", [req.session.u],function(e,r) {
      if(e) return cb(e);
      var rv = {};
      r.rows.forEach(function(r) {
       if(!rv[r.r_ref]) rv[r.r_ref] = {
	data: r.r_data, version: r.r_version,
	creationDate: r.r_ctime.toString(),
	updateDate: r.r_mtime.toString(),
	accessDate: r.r_atime.toString(),
	versions: {}
       };
       if(!r.rv_id) return;
       rv[r.r_ref].versions[rv[r.r_ref].currentVersion=r.rv_ref] = {
        header: r.rv_header, data: r.rv_data, version: r.rv_version,
	creationDate: r.rv_ctime.toString(),
	updateDate: r.rv_mtime.toString(),
	accessDate: r.rv_atime.toString()
       };
      });
      cb(null,rv);
     });
    },
    html: function(cb) {
     FS.readFile(CONFIG.dump_template,{encoding:'utf-8'},cb);
    }
   },function(e,r) {
    if(e) return cb(e);
    var d = new Date();
    res.attachment('Clipperz_'+d.getFullYear()+'_'+(d.getMonth()+1)+'_'+d.getDate()+'.html');
    var ojs = { users: {
     catchAllUser: { __masterkey_test_value__: 'masterkey', s: n123, v: n123 }
    } };
    r.u.d.records = r.records;
    ojs.users[r.u.u] = r.u.d;
    res.send(r.html.replace('/*offline_data_placeholder*/',
      "_clipperz_dump_data_="+JSON.stringify(ojs)
     +";"
     +"Clipperz.PM.Proxy.defaultProxy = new Clipperz.PM.Proxy.Offline();"
     +"Clipperz.Crypto.PRNG.defaultRandomGenerator().fastEntropyAccumulationForTestingPurpose();"));
   });
  }

 };
 rv.__defineGetter__('session_store',function(){ return function(o) { return new (clipperz_store(PG))(o) } });

 return rv;

};
