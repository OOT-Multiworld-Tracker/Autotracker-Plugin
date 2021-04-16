"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const CoreInjection_1 = require("modloader64_api/CoreInjection");
class autotracker_plugin {
    preinit() {
    }
    init() {
    }
    postinit() {
    }
    onTick(frame) {
        if (!this.core.link.exists) {
            return;
        }
        if (this.previousInventoryState)
            this.ModLoader.logger.info(JSON.stringify(this.previousInventoryState));
        if (!this.previousInventoryState || Object.entries(this.previousInventoryState).toString() != Object.entries(this.core.save.inventory).toString()) {
            this.previousInventoryState = this.core.save.inventory;
            this.ModLoader.logger.info(JSON.stringify(this.previousInventoryState));
        }
    }
    onItemGet() {
    }
}
__decorate([
    CoreInjection_1.InjectCore()
], autotracker_plugin.prototype, "core", void 0);
module.exports = autotracker_plugin;
//# sourceMappingURL=autotracker_plugin.js.map