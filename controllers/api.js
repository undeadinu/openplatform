const SKIP = { password: true, search: true, verifytoken: true };
const ONLINE = { online: true, datelogged: null };
const USERS_LIST_FIELDS = { id: 1, firstname: 1, lastname: 1, online: 1, sa: 1, blocked: 1, inactive: 1, company: 1, name: 1, items: 1, count: 1, page: 1, pages: 1, limit: 1 };

exports.install = function() {

	GROUP(['authorize'], function() {

		// Internal
		ROUTE('POST   /api/internal/apps/               *App          --> @refresh @save (response)');
		ROUTE('DELETE /api/internal/apps/{id}/          *App          --> @remove');
		ROUTE('POST   /api/internal/apps/meta/          *Meta         --> @exec');
		ROUTE('POST   /api/internal/users/              *User         --> @save');
		ROUTE('DELETE /api/internal/users/{id}/         *User         --> @remove');

		ROUTE('POST   /api/internal/users/rename/       *UserRename   --> @exec');
		ROUTE('POST   /api/internal/users/notify/       *UserNotify   --> @exec');
		ROUTE('POST   /api/internal/users/apps/         *UserApps     --> @exec');
		ROUTE('POST   /api/profile/                     *Profile      --> @save');

		ROUTE('GET    /api/internal/apps/{id}/',        json_apps_meta);
		ROUTE('GET    /api/internal/apps/',             json_apps_query);
		ROUTE('GET    /api/internal/users/{id}/',       json_users_read);
		ROUTE('GET    /api/internal/users/',            json_users_query);
		ROUTE('GET    /api/meta/',                      json_meta_query);

		ROUTE('GET    /api/account/                     *Account      --> @read');
		ROUTE('POST   /api/account/                     *Account      --> @save');

		ROUTE('GET    /api/internal/settings/           *Settings     --> @read');
		ROUTE('POST   /api/internal/settings/           *Settings     --> @save');
		ROUTE('POST   /api/internal/settings/smtp/      *SettingsSMTP --> @exec', [10000]);

		ROUTE('/api/upload/photo/',                     json_upload_photo,      ['post'], 1024 * 2);
		ROUTE('/api/upload/background/',                json_upload_background, ['post', 'upload'], 1024 * 5);

	});

	GROUP(['unauthorize'], function() {
		ROUTE('POST   /api/login/                       *Login        --> @exec');
		ROUTE('POST   /api/password/                    *Password     --> @exec');
	});

	// External
	ROUTE('GET    /api/verify/',                        json_verify);
	ROUTE('GET    /verify/',                            json_verify);
	ROUTE('GET    /api/online/{id}/',                   json_online);
	ROUTE('GET    /api/users/                           *User         --> @query');
	ROUTE('GET    /api/apps/                            *App          --> @query');
	ROUTE('GET    /api/badges/                          *Badge        --> @exec');
	ROUTE('POST   /api/notify/                          *Notification --> @save');


	// CORS
	CORS();
};

function json_verify() {

	var self = this;
	var obj = self.query.accesstoken ? OP.decodeAuthToken(self.query.accesstoken) : null;

	if (!obj) {
		self.invalid().push('error-invalid-accesstoken');
		return;
	}

	var app = obj.app;
	var user = obj.user;

	if (!user.online) {
		self.invalid().push('error-offline');
		return;
	}

	if (app.origin) {
		if (!app.origin[self.ip] && app.hostname !== self.ip) {
			self.invalid().push('error-invalid-origin');
			return;
		}
	} else if (app.hostname !== self.ip) {
		self.invalid().push('error-invalid-origin');
		return;
	} else if (user.inactive || user.blocked) {
		self.invalid().push('error-accessible');
		return;
	}

	self.json(OP.meta(app, user, true));
}

function json_apps_query() {
	var self = this;
	if (self.user.sa) {
		var data = {};
		data.items = G.apps;
		data.count = data.limit = data.items.length;
		data.page = 1;
		data.pages = 1;
		self.json(data);
	} else
		self.invalid().push('error-permissions');
}

function json_users_read(id) {
	var self = this;
	if (self.user.sa) {
		var user = G.users.findItem('id', id);
		if (user)
			self.json(user, false, (k, v) => SKIP[k] ? undefined : v);
		else
			self.json(null);
	} else
		self.invalid().push('error-permissions');
}

function json_users_query() {
	var self = this;
	if (self.user.sa) {
		var data = {};
		data.items = G.users;
		data.count = data.limit = data.items.length;
		data.page = 1;
		data.pages = 1;
		self.json(data, false, (k, v) => k >= 0 || USERS_LIST_FIELDS[k] ? v : undefined);
	} else
		self.invalid().push('error-permissions');
}

function json_meta_query() {
	this.json(G.meta, false);
}

function json_apps_meta(id) {
	var item = G.apps.findItem('id', id);
	if (item)
		this.json(OP.meta(item, this.user));
	else
		this.invalid().push('error-app-404');
}

function json_upload_photo() {
	var self = this;
	var id = NOW.format('yyyyMMddHHmm') + '_' + U.GUID(8) + '.jpg';
	var path = F.path.public('photos');
	F.path.mkdir(path);
	self.body.file.base64ToFile(path + id, () => self.json(id));
}

function json_upload_background() {
	var self = this;
	var file = self.files[0];

	if (file.isImage()) {
		var path = F.path.public('backgrounds');
		F.path.mkdir(path);
		var id = NOW.format('yyyyMMddHHmm') + '_' + U.GUID(8) + '.' + U.getExtension(file.filename);
		file.move(path + id, () => self.json(id));
	} else
		self.invalid('error-file-type');
}

function json_online(id) {
	var user = G.users.findItem('id', id);
	if (user) {
		ONLINE.online = user.online;
		ONLINE.datelogged = user.datelogged;
	} else {
		ONLINE.online = false;
		ONLINE.datelogged = null;
	}
	this.json(ONLINE);
}