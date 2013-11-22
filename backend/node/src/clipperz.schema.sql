CREATE SCHEMA clipperz;

CREATE TABLE clipperz.theuser (
 u_id serial PRIMARY KEY,
 u_name varchar NOT NULL UNIQUE,
 u_srp_s varchar NOT NULL,
 u_srp_v varchar NOT NULL,
 u_header json NOT NULL,
 u_statistics varchar NOT NULL,
 u_authversion varchar NOT NULL,
 u_version varchar NOT NULL,
 u_lock varchar NOT NULL
);

CREATE TABLE clipperz.therecord (
 r_id serial PRIMARY KEY,
 u_id integer NOT NULL REFERENCES clipperz.theuser(u_id) ON UPDATE CASCADE ON DELETE CASCADE,
 r_ref varchar NOT NULL UNIQUE,
 r_data varchar NOT NULL,
 r_version varchar NOT NULL,
 r_ctime timestamp NOT NULL DEFAULT current_timestamp,
 r_mtime timestamp NOT NULL DEFAULT current_timestamp,
 r_atime timestamp NOT NULL DEFAULT current_timestamp
);
CREATE INDEX therecord_u_id_key ON clipperz.therecord (u_id);

CREATE TABLE clipperz.therecordversion (
 rv_id serial PRIMARY KEY,
 r_id integer NOT NULL REFERENCES clipperz.therecord (r_id) ON UPDATE CASCADE ON DELETE CASCADE,
 rv_ref varchar NOT NULL UNIQUE,
 rv_header varchar,
 rv_data varchar NOT NULL,
 rv_version varchar NOT NULL,
 rv_previous_key varchar NOT NULL,
 rv_previous_id varchar,
 rv_ctime timestamp NOT NULL DEFAULT current_timestamp,
 rv_mtime timestamp NOT NULL DEFAULT current_timestamp,
 rv_atime timestamp NOT NULL DEFAULT current_timestamp
);

CREATE TABLE clipperz.otpstatus (
 otps_id serial PRIMARY KEY,
 otps_code varchar NOT NULL,
 otps_name varchar NOT NULL,
 otps_desc varchar NOT NULL
);

CREATE TABLE clipperz.theotp (
 otp_id serial PRIMARY KEY,
 u_id integer REFERENCES clipperz.theuser (u_id) ON UPDATE CASCADE ON DELETE CASCADE,
 otps_id integer REFERENCES clipperz.otpstatus (otps_id) ON UPDATE CASCADE ON DELETE CASCADE,
 otp_ref varchar NOT NULL UNIQUE,
 otp_key varchar NOT NULL UNIQUE,
 otp_key_checksum varchar NOT NULL,
 otp_data varchar NOT NULL,
 otp_version varchar NOT NULL,
 otp_ctime timestamp NOT NULL DEFAULT current_timestamp,
 otp_rtime timestamp NOT NULL DEFAULT current_timestamp,
 otp_utime timestamp NOT NULL DEFAULT current_timestamp
);
