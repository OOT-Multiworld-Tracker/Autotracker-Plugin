import {IPlugin, IModLoaderAPI} from 'modloader64_api/IModLoaderAPI';
import {IInventory, IOOTCore, OotEvents} from 'modloader64_api/OOT/OOTAPI';
import {InjectCore} from 'modloader64_api/CoreInjection';
import { EventHandler, EventsClient } from 'modloader64_api/EventHandler';

class autotracker_plugin implements IPlugin{

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;
    @InjectCore()
    core!: IOOTCore;

    previousInventoryState!: IInventory;

    preinit(): void {
    }
    init(): void {
    }
    postinit(): void {
    }
    onTick(frame?: number | undefined): void {
        if (!this.core.link.exists) { return; }

        if (!this.previousInventoryState || Object.entries(this.previousInventoryState).toString() != Object.entries(this.core.save.inventory).toString()) {
            this.previousInventoryState = this.core.save.inventory;
        }
    }

    onItemGet(): void {

    }

}

module.exports = autotracker_plugin;