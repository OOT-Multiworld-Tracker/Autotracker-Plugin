"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const OOTAPI_1 = require("modloader64_api/OOT/OOTAPI");
const CoreInjection_1 = require("modloader64_api/CoreInjection");
const EventHandler_1 = require("modloader64_api/EventHandler");
const ws_1 = require("ws");
class autotracker_plugin {
    preinit() {
    }
    init() {
        this.wss = new ws_1.Server({ port: 8080 });
        this.ModLoader.logger.info("AutoTracker WebSocket initalized on port 8080");
        this.wss.on('connection', (socket) => {
            socket.on('message', (data) => {
                let json = JSON.parse(data.toString());
                switch (json["PAYLOAD"]) {
                    case 0:
                        this.ModLoader.logger.info(`Sent current game-state for tracker request`);
                        let payload = {};
                        this.sendState(0, { save: this.core.save });
                        break;
                    case 1:
                        socket.send("NOT_INITALIZED");
                        break;
                }
            });
        });
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
    CoreInjection_1.InjectCore()
], autotracker_plugin.prototype, "core", void 0);
__decorate([
    EventHandler_1.EventHandler(OOTAPI_1.OotEvents.ON_SAVE_LOADED)
], autotracker_plugin.prototype, "onSaveLoaded", null);
__decorate([
    EventHandler_1.EventHandler(OOTAPI_1.OotEvents.ON_SCENE_CHANGE)
], autotracker_plugin.prototype, "onSceneChange", null);
module.exports = autotracker_plugin;
//# sourceMappingURL=autotracker_plugin.js.map