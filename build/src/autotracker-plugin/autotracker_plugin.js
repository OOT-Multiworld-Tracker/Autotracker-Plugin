"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerUpdate = void 0;
const OOTAPI_1 = require("modloader64_api/OOT/OOTAPI");
const CoreInjection_1 = require("modloader64_api/CoreInjection");
const EventHandler_1 = require("modloader64_api/EventHandler");
const ws_1 = require("ws");
const ModLoaderDefaultImpls_1 = require("modloader64_api/ModLoaderDefaultImpls");
const NetworkHandler_1 = require("modloader64_api/NetworkHandler");
class autotracker_plugin {
    ModLoader;
    pluginName;
    core;
    previousInventoryState;
    lastPacket;
    wss;
    preinit() {
    }
    init() {
        this.wss;
        try {
            this.wss = new ws_1.Server({ port: 8080 }).on("error", () => {
                this.wss = new ws_1.Server({ port: 19420 });
            });
        }
        catch (e) {
            console.log(e);
        }
        this.ModLoader.logger.info("AutoTracker WebSocket initalized on port 8080");
        this.wss.on('connection', (socket) => {
            socket.on('message', (data) => {
                let json = JSON.parse(data.toString());
                console.log(data);
                switch (json["PAYLOAD"]) {
                    case 0:
                        this.ModLoader.logger.info(`Sent current game-state for tracker request`);
                        this.sendState(0, { save: this.core.save });
                        break;
                    case 1:
                        socket.send("NOT_INITALIZED");
                        break;
                    case 2:
                        let json = JSON.parse(data.toString());
                        this.ModLoader.clientSide.sendPacket(new TrackerUpdate(data.toString(), this.ModLoader.clientLobby));
                        break;
                }
            });
        });
        setInterval(() => console.log(this.core.global.liveSceneData_chests), 5000);
    }
    postinit() {
    }
    onTick(frame) {
        if (!this.core.link.exists) {
            return;
        }
    }
    onSaveLoaded() {
        this.ModLoader.logger.info(`Sent current game-state to tracker`);
        this.sendState(0, { save: this.core.save });
        setInterval(() => { this.sendState(0, { save: this.core.save }); }, 10000);
    }
    onClientItemGet(packet) {
        var data = packet.data;
        this.sendState(3, JSON.parse(data).data);
    }
    onSceneChange() {
        this.ModLoader.logger.info(`Sent current scene to tracker`);
        this.sendState(1, { scene: this.core.global.scene });
    }
    sendState(payload, state) {
        this.wss.clients.forEach((connectedClient) => {
            connectedClient.send(JSON.stringify({ payload, data: state })); // Send Scene State
        });
    }
}
__decorate([
    (0, CoreInjection_1.InjectCore)()
], autotracker_plugin.prototype, "core", void 0);
__decorate([
    (0, EventHandler_1.EventHandler)(OOTAPI_1.OotEvents.ON_SAVE_LOADED)
], autotracker_plugin.prototype, "onSaveLoaded", null);
__decorate([
    (0, NetworkHandler_1.NetworkHandler)("TrackerUpdate")
], autotracker_plugin.prototype, "onClientItemGet", null);
__decorate([
    (0, EventHandler_1.EventHandler)(OOTAPI_1.OotEvents.ON_SCENE_CHANGE)
], autotracker_plugin.prototype, "onSceneChange", null);
class TrackerUpdate extends ModLoaderDefaultImpls_1.Packet {
    data;
    constructor(data, lobby) {
        super("TrackerUpdate", "MultiTracker", lobby, true);
        this.data = data;
    }
}
exports.TrackerUpdate = TrackerUpdate;
module.exports = autotracker_plugin;
//# sourceMappingURL=autotracker_plugin.js.map