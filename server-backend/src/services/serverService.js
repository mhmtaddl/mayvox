"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.AppError = void 0;
exports.listMyServers = listMyServers;
exports.createServer = createServer;
exports.getServer = getServer;
exports.searchServers = searchServers;
exports.joinByInvite = joinByInvite;
exports.leaveServer = leaveServer;
var db_1 = require("../repositories/db");
var nanoid_1 = require("nanoid");
function generateInviteCode() {
    return (0, nanoid_1.nanoid)(8).toUpperCase();
}
function toShortName(name) {
    var words = name.trim().split(/\s+/);
    if (words.length >= 2)
        return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}
function toResponse(server, activity, role) {
    var _a, _b;
    return {
        id: server.id,
        name: server.name,
        shortName: server.short_name,
        avatarUrl: server.avatar_url,
        description: server.description,
        memberCount: (_a = activity === null || activity === void 0 ? void 0 : activity.member_count) !== null && _a !== void 0 ? _a : 0,
        activeCount: (_b = activity === null || activity === void 0 ? void 0 : activity.active_count) !== null && _b !== void 0 ? _b : 0,
        capacity: server.capacity,
        level: server.level,
        inviteCode: server.invite_code,
        isPublic: server.is_public,
        createdAt: server.created_at,
        role: role,
    };
}
/** Kullanıcının dahil olduğu sunucuları listele */
function listMyServers(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.queryMany)("SELECT s.*, sm.role, COALESCE(sa.member_count, 0) as member_count, COALESCE(sa.active_count, 0) as active_count\n     FROM servers s\n     JOIN server_members sm ON sm.server_id = s.id\n     LEFT JOIN server_activity sa ON sa.server_id = s.id\n     WHERE sm.user_id = $1\n     ORDER BY sm.joined_at ASC", [userId])];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (r) { return toResponse(r, { server_id: r.id, member_count: r.member_count, active_count: r.active_count, updated_at: '' }, r.role); })];
            }
        });
    });
}
/** Yeni sunucu oluştur + owner'ı member olarak ekle + varsayılan kanallar */
function createServer(userId, name, description) {
    return __awaiter(this, void 0, void 0, function () {
        var client, inviteCode, shortName, server, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 9, 11, 12]);
                    return [4 /*yield*/, client.query('BEGIN')];
                case 3:
                    _a.sent();
                    inviteCode = generateInviteCode();
                    shortName = toShortName(name);
                    return [4 /*yield*/, client.query("INSERT INTO servers (owner_user_id, name, short_name, description, invite_code)\n       VALUES ($1, $2, $3, $4, $5) RETURNING *", [userId, name, shortName, description, inviteCode])];
                case 4:
                    server = (_a.sent()).rows[0];
                    // Owner'ı member olarak ekle
                    return [4 /*yield*/, client.query("INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'owner')", [server.id, userId])];
                case 5:
                    // Owner'ı member olarak ekle
                    _a.sent();
                    // Varsayılan kanallar
                    return [4 /*yield*/, client.query("INSERT INTO channels (server_id, name, type, position, is_default) VALUES\n       ($1, 'Genel', 'voice', 0, true),\n       ($1, 'Sohbet', 'voice', 1, false)", [server.id])];
                case 6:
                    // Varsayılan kanallar
                    _a.sent();
                    // Aktivite kaydı
                    return [4 /*yield*/, client.query("INSERT INTO server_activity (server_id, member_count) VALUES ($1, 1)", [server.id])];
                case 7:
                    // Aktivite kaydı
                    _a.sent();
                    return [4 /*yield*/, client.query('COMMIT')];
                case 8:
                    _a.sent();
                    return [2 /*return*/, toResponse(server, { server_id: server.id, member_count: 1, active_count: 0, updated_at: '' }, 'owner')];
                case 9:
                    err_1 = _a.sent();
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 10:
                    _a.sent();
                    throw err_1;
                case 11:
                    client.release();
                    return [7 /*endfinally*/];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/** Sunucu detay */
function getServer(serverId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.queryOne)("SELECT s.*, sm.role, COALESCE(sa.member_count, 0) as member_count, COALESCE(sa.active_count, 0) as active_count\n     FROM servers s\n     LEFT JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $2\n     LEFT JOIN server_activity sa ON sa.server_id = s.id\n     WHERE s.id = $1", [serverId, userId])];
                case 1:
                    row = _b.sent();
                    if (!row)
                        return [2 /*return*/, null];
                    return [2 /*return*/, toResponse(row, { server_id: row.id, member_count: row.member_count, active_count: row.active_count, updated_at: '' }, (_a = row.role) !== null && _a !== void 0 ? _a : undefined)];
            }
        });
    });
}
/** Public sunucu arama */
function searchServers(query) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.queryMany)("SELECT s.*, COALESCE(sa.member_count, 0) as member_count, COALESCE(sa.active_count, 0) as active_count\n     FROM servers s\n     LEFT JOIN server_activity sa ON sa.server_id = s.id\n     WHERE s.is_public = true AND s.name ILIKE $1\n     ORDER BY sa.member_count DESC NULLS LAST\n     LIMIT 20", ["%".concat(query, "%")])];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (r) { return toResponse(r, { server_id: r.id, member_count: r.member_count, active_count: r.active_count, updated_at: '' }); })];
            }
        });
    });
}
/** Davet kodu ile sunucuya katıl */
function joinByInvite(userId, code) {
    return __awaiter(this, void 0, void 0, function () {
        var server, existing, activity, memberCount;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.queryOne)("SELECT * FROM servers WHERE invite_code = $1", [code])];
                case 1:
                    server = _b.sent();
                    if (!server)
                        throw new AppError(404, 'Geçersiz davet kodu');
                    return [4 /*yield*/, (0, db_1.queryOne)("SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2", [server.id, userId])];
                case 2:
                    existing = _b.sent();
                    if (existing)
                        throw new AppError(409, 'Bu sunucuya zaten üyesin');
                    return [4 /*yield*/, (0, db_1.queryOne)("SELECT member_count FROM server_activity WHERE server_id = $1", [server.id])];
                case 3:
                    activity = _b.sent();
                    if (activity && activity.member_count >= server.capacity) {
                        throw new AppError(403, 'Sunucu kapasitesi dolu');
                    }
                    // Üye ekle
                    return [4 /*yield*/, db_1.pool.query("INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'member')", [server.id, userId])];
                case 4:
                    // Üye ekle
                    _b.sent();
                    // Aktivite güncelle
                    return [4 /*yield*/, db_1.pool.query("UPDATE server_activity SET member_count = member_count + 1, updated_at = now() WHERE server_id = $1", [server.id])];
                case 5:
                    // Aktivite güncelle
                    _b.sent();
                    memberCount = ((_a = activity === null || activity === void 0 ? void 0 : activity.member_count) !== null && _a !== void 0 ? _a : 0) + 1;
                    return [2 /*return*/, toResponse(server, { server_id: server.id, member_count: memberCount, active_count: 0, updated_at: '' }, 'member')];
            }
        });
    });
}
/** Sunucudan ayrıl */
function leaveServer(userId, serverId) {
    return __awaiter(this, void 0, void 0, function () {
        var member;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.queryOne)("SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2", [serverId, userId])];
                case 1:
                    member = _a.sent();
                    if (!member)
                        throw new AppError(404, 'Bu sunucunun üyesi değilsin');
                    if (member.role === 'owner')
                        throw new AppError(403, 'Sunucu sahibi sunucudan ayrılamaz');
                    return [4 /*yield*/, db_1.pool.query("DELETE FROM server_members WHERE server_id = $1 AND user_id = $2", [serverId, userId])];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db_1.pool.query("UPDATE server_activity SET member_count = GREATEST(0, member_count - 1), updated_at = now() WHERE server_id = $1", [serverId])];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** Uygulama seviyesinde hata */
var AppError = /** @class */ (function (_super) {
    __extends(AppError, _super);
    function AppError(status, message) {
        var _this = _super.call(this, message) || this;
        _this.status = status;
        return _this;
    }
    return AppError;
}(Error));
exports.AppError = AppError;
