"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var auth_1 = require("../middleware/auth");
var serverValidators_1 = require("../validators/serverValidators");
var serverService = require("../services/serverService");
var channelService = require("../services/channelService");
var router = (0, express_1.Router)();
// Tüm route'lar auth gerektirir
router.use(auth_1.authMiddleware);
/** GET /servers/my — Kullanıcının sunucuları */
router.get('/my', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var servers, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, serverService.listMyServers(req.userId)];
            case 1:
                servers = _a.sent();
                res.json(servers);
                return [3 /*break*/, 3];
            case 2:
                err_1 = _a.sent();
                handleError(res, err_1);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/** POST /servers — Yeni sunucu oluştur */
router.post('/', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var valid, server, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                valid = (0, serverValidators_1.validateCreateServer)(req.body, res);
                if (!valid)
                    return [2 /*return*/];
                return [4 /*yield*/, serverService.createServer(req.userId, valid.name, valid.description)];
            case 1:
                server = _a.sent();
                res.status(201).json(server);
                return [3 /*break*/, 3];
            case 2:
                err_2 = _a.sent();
                handleError(res, err_2);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/** GET /servers/search?q= — Public sunucu ara */
router.get('/search', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var query, servers, err_3;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                query = String((_a = req.query.q) !== null && _a !== void 0 ? _a : '');
                return [4 /*yield*/, serverService.searchServers(query)];
            case 1:
                servers = _b.sent();
                res.json(servers);
                return [3 /*break*/, 3];
            case 2:
                err_3 = _b.sent();
                handleError(res, err_3);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/** GET /servers/:id — Sunucu detay */
router.get('/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var server, err_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, serverService.getServer(req.params.id, req.userId)];
            case 1:
                server = _a.sent();
                if (!server) {
                    res.status(404).json({ error: 'Sunucu bulunamadı' });
                    return [2 /*return*/];
                }
                res.json(server);
                return [3 /*break*/, 3];
            case 2:
                err_4 = _a.sent();
                handleError(res, err_4);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/** POST /servers/join — Davet kodu ile katıl */
router.post('/join', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var valid, server, err_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                valid = (0, serverValidators_1.validateJoinServer)(req.body, res);
                if (!valid)
                    return [2 /*return*/];
                return [4 /*yield*/, serverService.joinByInvite(req.userId, valid.code)];
            case 1:
                server = _a.sent();
                res.status(201).json(server);
                return [3 /*break*/, 3];
            case 2:
                err_5 = _a.sent();
                handleError(res, err_5);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/** POST /servers/:id/leave — Sunucudan ayrıl */
router.post('/:id/leave', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var err_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, serverService.leaveServer(req.userId, req.params.id)];
            case 1:
                _a.sent();
                res.status(204).end();
                return [3 /*break*/, 3];
            case 2:
                err_6 = _a.sent();
                handleError(res, err_6);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/** GET /servers/:id/channels — Sunucunun kanalları */
router.get('/:id/channels', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var channels, err_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, channelService.listChannels(req.params.id, req.userId)];
            case 1:
                channels = _a.sent();
                res.json(channels);
                return [3 /*break*/, 3];
            case 2:
                err_7 = _a.sent();
                handleError(res, err_7);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
function handleError(res, err) {
    if (err instanceof serverService.AppError) {
        res.status(err.status).json({ error: err.message });
        return;
    }
    console.error('[server-route]', err);
    res.status(500).json({ error: 'Sunucu hatası' });
}
exports.default = router;
