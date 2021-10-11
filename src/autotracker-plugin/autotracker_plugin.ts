import {IPlugin, IModLoaderAPI, ILogger} from 'modloader64_api/IModLoaderAPI';
import {AmmoUpgrade, IInventory, IOOTCore, LinkState, OotEvents} from 'modloader64_api/OOT/OOTAPI';
import {InjectCore} from 'modloader64_api/CoreInjection';
import { bus, EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { Server } from 'ws';

import { ActorCategory } from 'modloader64_api/OOT/ActorCategory';

enum AutotrackerEvents {
    ON_CHEST_OPENED = 'Autotracker:onChestOpened',
    ON_COLLECTABLE_GATHERED = 'Autotracker:onCollectableGathered',
    ON_INVENTORY_CHANGED = 'Autotracker:onInventoryChanged',
    ON_SKULLTULA_GATHERED = 'Autotracker:onSkulltulaGathered'
}

enum AutotrackerPayloads {
    CONNECTED_SAVE_REQUEST,

}

enum MultiworldTrackerPayloads {
    SEND_SAVE,
    SEND_SCENE,
    UNUSED,

}

type AutotrackerSkulltula = {
    index: number,
    skulltula: number,
}

class autotracker_plugin implements IPlugin{

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;

    saveLoaded: boolean = false;

    @InjectCore()
    core!: IOOTCore;

    previousChestState!: Buffer;
    previousCollectableState!: Buffer;
    previousSkulltulaState!: Buffer;
    prepareItemSend: boolean = false;
    skulltula: AutotrackerSkulltula = {index: 0, skulltula: 0};
    skulltulaGathered: boolean = false;
    saveInit: boolean = false;
    lastPacket!: object;
    wss!: Server;

    preinit(): void {
        
    }

    init(): void {
        this.wss = new Server({ port: 8080 })
        this.ModLoader.logger.info("AutoTracker WebSocket initalized on port 8080")

        this.wss.on('connection', (socket) => {
            socket.on('message', (data) => {
                let json = JSON.parse(data.toString());
                switch (json["PAYLOAD"]) {
                    case 0:
                        this.ModLoader.logger.info(`Sent current game-state for tracker request`);
                        let payload = {}
                        this.sendState(0, {save: this.core.save})
                        break

                    case 1:
                        socket.send("NOT_INITALIZED")
                        break
                }
            })
        })
    }
    postinit(): void {
        
    }

    onTick(frame?: number | undefined): void {
        if (!this.core.link.exists) { return }
        if (!this.saveLoaded) return;

        if (frame !== undefined && frame % 20 == 0) {
            if (this.core.link.state == (LinkState.BUSY || LinkState.LOADING_ZONE)) return;

            this.previousSkulltulaState.forEach((v, i) => {
                var cur = this.core.save.skulltulaFlags;
                if (this.skulltula.skulltula) return;
                if ((v ^ cur[i]) != 0)
                    this.skulltula = {index: i, skulltula: (v ^ cur[i])};
            });

            if (this.skulltula.skulltula) {
                bus.emit(AutotrackerEvents.ON_SKULLTULA_GATHERED, {index: this.skulltula.index, skulltula: this.skulltula.skulltula});
                this.previousSkulltulaState = this.core.save.skulltulaFlags;
                this.skulltula = {index: 0, skulltula: 0};
            }
        }

        if (this.core.link.state == LinkState.BUSY) this.prepareItemSend = true;

        if (this.prepareItemSend && this.core.link.state == LinkState.STANDING) {
            var chestOpened = this.core.global.liveSceneData_chests.toJSON().data[3] ^ this.previousChestState.toJSON().data[3];
            var collectableGathered = this.core.global.liveSceneData_collectable.toJSON().data[0] ^ this.previousCollectableState.toJSON().data[0];

            if (chestOpened) bus.emit(AutotrackerEvents.ON_CHEST_OPENED, chestOpened);
            else if (collectableGathered) bus.emit(AutotrackerEvents.ON_COLLECTABLE_GATHERED, collectableGathered);
            else this.ModLoader.logger.error("Nothing was collected. This is probably because of the new handler.");

            this.previousChestState = this.core.global.liveSceneData_chests;
            this.previousCollectableState = this.core.global.liveSceneData_collectable;

            this.prepareItemSend = false;
        }
    }

    @EventHandler(OotEvents.ON_SAVE_LOADED)
    onSaveLoaded(): void {
        this.ModLoader.logger.info(`Sent current game-state to tracker`);
        this.saveLoaded = true;
        this.sendState(0, {save: this.core.save})

        this.previousSkulltulaState = this.core.save.skulltulaFlags;

        // this.core.save.inventory.bombs = true;
        // this.core.save.inventory.bombBag = AmmoUpgrade.MAX;
        // this.core.save.inventory.bombsCount = 40;

        // this.core.save.inventory.dekuSticks = true;
        // this.core.save.inventory.dekuSticksCapacity = AmmoUpgrade.MAX;
        // this.core.save.inventory.dekuSticksCount = 30;

        // this.core.commandBuffer.runWarp(0x138, 16, ()=>{})
    }

    @EventHandler(OotEvents.ON_SCENE_CHANGE)
    onSceneChange(): void {
        this.ModLoader.logger.info(`Sent current scene to tracker`);
        this.sendSaveState();
        this.sendState(1, {scene: this.core.global.scene})

        this.previousChestState = this.core.global.liveSceneData_chests;
        this.previousCollectableState = this.core.global.liveSceneData_collectable;
        this.previousSkulltulaState = this.core.save.skulltulaFlags;
    }

    @EventHandler(OotEvents.ON_HEALTH_CHANGE)
    onHealthChange() {
        this.ModLoader.logger.info(`Sent current game-state to tracker (Health Change)`);
        this.sendSaveState();
    }

    @EventHandler(AutotrackerEvents.ON_CHEST_OPENED)
    onChestOpened(chestOpened) {
        this.ModLoader.logger.debug("Sending save packet (Chest Update)");
        this.sendSaveState();
        this.ModLoader.logger.debug(`Chest Opened: ${chestOpened.toString()}`);
        this.sendChestState(chestOpened)
    }

    @EventHandler(AutotrackerEvents.ON_COLLECTABLE_GATHERED)
    onCollectableGathered(collectableGathered) {
        this.ModLoader.logger.debug(`Collectable Gathered: ${collectableGathered.toString()}`);
    }

    @EventHandler(AutotrackerEvents.ON_SKULLTULA_GATHERED)
    onSkulltulaGathered(skulltula) {
        this.ModLoader.logger.debug(JSON.stringify(skulltula));

    }

    sendState(payload: number, state: object) {
        this.wss.clients.forEach((connectedClient) => {
            connectedClient.send(JSON.stringify({payload, data: state})) // Send Scene State
        })
    }

    sendSaveState() {
        this.sendState(MultiworldTrackerPayloads.SEND_SAVE, {save: this.core.save})
    }

    sendChestState(chestOpened) {
        this.sendState(5, { scene: this.core.global.scene, chestOpened })
    }
}

module.exports = autotracker_plugin;