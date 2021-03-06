const Fs = require('fs');
const OP = global.OP = {};
const SKIP = { localitylinker: 1, companylinker: 1, countsessions: 1 };

// G.users = [];
// G.apps = [];

OP.login = function(login, password, callback) {
	var user = G.users.findItem('login', login);
	if (user && user.password === password.sha256())
		callback(null, user);
	else
		callback();
};

OP.logout = function(controller) {
	controller.redirect('/');
};

// Saves stats into the file
OP.save = function(callback) {
	G.users.quicksort('name');
	G.apps.quicksort('name');
	EMIT('users.backup', G.users);
	Fs.writeFile(F.path.databases('users.json'), JSON.stringify(G.users, null, cleaner_user), F.error());
	EMIT('apps.backup', G.apps);
	Fs.writeFile(F.path.databases('apps.json'), JSON.stringify(G.apps), F.error());
	callback && callback();
};

OP.save2 = function(type) {
	setTimeout2('OP.saveState.' + (type || 0), function() {

		if (!type || type === 2) {
			EMIT('users.backup', G.users);
			Fs.writeFile(F.path.databases('users.json'), JSON.stringify(G.users, null, cleaner_user), F.error());
		}

		if (!type || type === 1) {
			EMIT('apps.backup', G.apps);
			Fs.writeFile(F.path.databases('apps.json'), JSON.stringify(G.apps), F.error());
		}

	}, 1000, 10);
};

function cleaner_user(k) {
	return k >= 0 || !SKIP[k];
}

OP.load = function(callback) {
	$WORKFLOW('Settings', 'init', function() {

		Fs.readFile(F.path.databases('users.json'), function(err, response) {
			G.users = response ? response.toString('utf8').parseJSON(true) : [];

			for (var i = 0, length = G.users.length; i < length; i++) {
				var u = G.users[i];
				u.online = false;
				u.countsessions = 0;
			}

			Fs.readFile(F.path.databases('apps.json'), function(err, response) {
				G.apps = response ? response.toString('utf8').parseJSON(true) : [];

				for (var i = 0, length = G.apps.length; i < length; i++)
					G.apps[i].online = false;

				G.apps.quicksort('title');
				G.apps.length && $WORKFLOW('App', 'state');
				callback && callback();
			});

			// Refreshes meta info
			$WORKFLOW('User', 'refresh');
		});
	});
};

// Return user profile object
OP.profile = function(user) {

	var meta = {};
	meta.openplatformid = OP.id;
	meta.name = user.name;
	meta.photo = user.photo;
	meta.locality = user.locality;
	meta.ou = user.ou;
	meta.company = user.company;
	meta.sa = user.sa;
	meta.apps = [];
	meta.countnotifications = user.countnotifications;
	meta.sounds = user.sounds;
	meta.volume = user.volume;
	meta.colorscheme = user.colorscheme || F.config.colorscheme;
	meta.background = user.background || F.config.background;

	for (var i = 0, length = G.apps.length; i < length; i++) {
		var app = G.apps[i];
		!app.blocked && user.apps && user.apps[app.id] && meta.apps.push({ id: app.id, icon: app.icon, title: app.title, name: app.name, online: app.online, version: app.version, linker: app.linker, notifications: app.allownotifications, responsive: app.responsive, countnotifications: user.apps[app.id].countnotifications, countbadges: user.apps[app.id].countbadges, width: app.width, height: app.height, screenshots: app.screenshots == true, resize: app.resize == true, type: app.type });
	}

	if (user.sa) {
		meta.apps.push({ id: '_users', icon: 'users', title: 'Users', name: 'Users', online: true, internal: true, linker: '_users', width: 800, height: 650, resize: false });
		meta.apps.push({ id: '_apps', icon: 'rocket', title: 'Apps', name: 'Apps', online: true, internal: true, linker: '_apps', width: 800, height: 650, resize: false });
		meta.apps.push({ id: '_settings', icon: 'cogs', title: 'Settings', name: 'Settings', online: true, internal: true, linker: '_settings', width: 600, height: 690, resize: false });
	}

	meta.apps.push({ id: '_account', icon: 'cog', title: 'Account', name: 'Account', online: true, internal: true, linker: '_account', width: 500, height: 720, resize: false });
	return meta;
};

// Output see the app only
OP.meta = function(app, user, serverside) {

	if (!user.apps || !user.apps[app.id])
		return null;

	var meta = { datetime: NOW, ip: user.ip, accesstoken: OP.encodeAuthToken(app, user), url: app.frame, settings: app.settings, id: app.id };

	meta.verify = F.config.url + '/api/verify/?accesstoken=' + meta.accesstoken;
	meta.openplatform = F.config.url;
	meta.openplatformid = OP.id;
	meta.colorscheme = F.config.colorscheme;
	meta.background = F.config.background;

	if (app.serververify && !serverside) {
		var tmp = readuser(user, app.allowreadprofile, app);
		meta.serverside = true;
		meta.profile = {};
		meta.profile.badge = tmp.badge;
		meta.profile.notify = tmp.notify;
		return meta;
	} else
		meta.serverside = serverside === true;

	if (app.allowreadmeta)
		meta.meta = G.meta;

	if (app.allowreadprofile) {

		meta.profile = readuser(user, app.allowreadprofile, app);

		// Specific settings for the current user
		var data = user.apps ? user.apps[app.id] : null;
		if (data) {
			meta.profile.settings = data.settings;
			// meta.profile.roles = data.roles || EMPTYARRAY;
		}
	}

	if (app.allowreadapps)
		meta.apps = F.config.url + '/api/apps/?accesstoken=' + meta.accesstoken;

	if (app.allowreadusers)
		meta.users = F.config.url + '/api/users/?accesstoken=' + meta.accesstoken;

	return meta;
};

// Notifications + badges
OP.encodeToken = function(app, user) {
	var sign = app.id + '-' + user.id + '-' + (user.accesstoken + app.accesstoken).crc32(true);
	return sign + '-' + (sign + F.config.accesstoken).crc32(true);
};

OP.decodeToken = function(sign) {

	var arr = sign.split('-');
	if (arr.length !== 4)
		return null;

	var tmp = (arr[0] + '-' + arr[1] + '-' + arr[2] + F.config.accesstoken).crc32(true) + '';
	if (tmp !== arr[3])
		return null;

	var obj = {};
	var app = G.apps.findItem('id', arr[0]);
	if (app == null)
		return null;

	var user = G.users.findItem('id', arr[1]);
	if (user == null)
		return null;

	var tmp = (user.accesstoken + app.accesstoken).crc32(true) + '';
	if (tmp !== arr[2])
		return null;

	obj.app = app;
	obj.user = user;
	return obj;
};

// Auth token
OP.encodeAuthToken = function(app, user) {
	var sign = app.id + '-' + user.id;
	sign += '-' + ((user.accesstoken + app.accesstoken).crc32(true) + '' + (app.id + user.id + user.verifytoken + F.config.accesstoken).crc32(true));
	return sign.encrypt(F.config.accesstoken.substring(0, 20));
};

OP.decodeAuthToken = function(sign) {

	sign = sign.decrypt(F.config.accesstoken.substring(0, 20));

	if (!sign)
		return null;

	var arr = sign.split('-');

	if (arr.length !== 3)
		return null;

	var obj = {};
	var app = G.apps.findItem('id', arr[0]);
	if (app == null)
		return null;

	var user = G.users.findItem('id', arr[1]);
	if (user == null)
		return null;

	var tmp = (user.accesstoken + app.accesstoken).crc32(true) + '' + (app.id + user.id + user.verifytoken + F.config.accesstoken).crc32(true);
	if (tmp !== arr[2])
		return null;

	obj.app = app;
	obj.user = user;
	return obj;
};

function readapp(app, type) {

	// type 1: basic info
	// type 2: all info

	var obj = {};
	obj.id = app.id;
	obj.title = app.title;
	obj.allowreadapps = app.allowreadapps;
	obj.allowreadusers = app.allowreadusers;
	obj.allownotifications = app.allownotifications;
	obj.responsive = app.responsive;
	obj.icon = app.icon;
	obj.description = app.description;
	obj.name = app.name;
	obj.version = app.version;
	obj.online = app.online;
	obj.daterefreshed = app.daterefreshed;
	obj.datecreated = app.datecreated;
	obj.author = app.author;
	obj.type = app.type;

	switch (type) {
		case 2:
			obj.url = app.url;
			obj.frame = app.frame;
			obj.roles = app.roles;
			obj.email = app.email;
			obj.custom = app.custom;
			obj.origin = app.origin;
			break;
	}

	return obj;
}

function readuser(user, type, app) {

	// type 1: basic info
	// type 2: all info
	// type 3: app users - basic info
	// type 4: app users - all info

	if (type > 2 && (!user.apps || !user.apps[app.id]) || user.inactive)
		return;

	var obj = {};
	obj.id = user.id;
	obj.supervisorid = user.supervisorid;
	obj.apps = user.apps2;
	obj.blocked = user.blocked;
	obj.company = user.company;
	obj.companylinker = user.companylinker;
	obj.datebirth = user.datebirth;
	obj.datecreated = user.datecreated;
	obj.dateend = user.dateend;
	obj.datebeg = user.datebeg;
	obj.dateupdated = user.dateupdated;
	obj.firstname = user.firstname;
	obj.gender = user.gender;
	obj.language = user.language;
	obj.lastname = user.lastname;
	obj.name = user.name;
	obj.notifications = user.notifications;
	obj.online = user.online;
	obj.photo = F.config.url + '/photos/' + user.photo;
	obj.ou = user.ou;
	obj.ougroups = user.ougroups ? Object.keys(user.ougroups) : EMPTYARRAY;
	obj.locality = user.locality;
	obj.localitylinker = user.localitylinker;
	obj.reference = user.reference;
	obj.countnotifications = user.countnotifications || 0;
	obj.countbadges = user.countbadges || 0;
	obj.countsessions = user.countsessions || 0;
	obj.colorscheme = user.colorscheme || F.config.colorscheme;
	obj.background = user.background || F.config.background;

	var appdata = user.apps[app.id];

	if (user.roles && user.roles.length) {
		obj.roles = appdata ? appdata.roles.slice(0) : EMPTYARRAY;
		for (var i = 0; i < user.roles.length; i++)
			obj.roles.push(user.roles[i]);
	} else
		obj.roles = appdata ? appdata.roles : EMPTYARRAY;

	// obj.appcountbadges = appdata.countbadges || 0;
	// obj.appcountnotifications = appdata.countnotifications || 0;
	obj.groups = user.groups;
	obj.sa = user.sa;
	obj.sounds = user.sounds;
	obj.volume = user.volume;
	obj.badge = F.config.url + '/api/badges/?accesstoken=' + OP.encodeToken(app, user);

	if (obj.notifications)
		obj.notify = F.config.url + '/api/notify/?accesstoken=' + OP.encodeToken(app, user);

	switch (type) {
		case 2:
		case 4:
			obj.email = user.email;
			obj.phone = user.phone;
			break;
	}

	return obj;
}

OP.users = function(app, query) {
	var arr = [];
	if (app.allowreadusers) {
		for (var i = 0, length = G.users.length; i < length; i++) {
			var item = readuser(G.users[i], app.allowreadusers, app);
			item && arr.push(item);
		}
	}
	return { items: arr, page: 1, count: arr.length, pages: 1, limit: arr.length };
};

OP.apps = function(app, query) {
	var arr = [];
	if (app.allowreadapps) {
		for (var i = 0, length = G.users.length; i < length; i++) {
			var item = readapp(G.apps[i], app.allowreadapps);
			item && arr.push(item);
		}
	}
	return { items: arr, page: 1, count: arr.length, pages: 1, limit: arr.length };
};

OP.ou = function(val) {
	var ou = val.split('/').trim();
	return ou.join(' / ');
};

F.helpers.profile = function() {
	return JSON.stringify(readuser(this.user, 1));
};

// Load
OP.load();