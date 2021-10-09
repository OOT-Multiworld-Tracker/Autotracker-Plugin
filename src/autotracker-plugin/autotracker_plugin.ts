import {IPlugin, IModLoaderAPI, ILogger} from 'modloader64_api/IModLoaderAPI';
import {IInventory, IOOTCore, LinkState, OotEvents} from 'modloader64_api/OOT/OOTAPI';
import {InjectCore} from 'modloader64_api/CoreInjection';
import { bus, EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { Server } from 'ws';

import { ActorCategory } from 'modloader64_api/OOT/ActorCategory';

enum AutotrackerEvents {
    ON_CHEST_OPENED =  'Autotracker:onChestOpened'
}

class autotracker_plugin implements IPlugin{

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;

    saveLoaded: boolean = false;

    @InjectCore()
    core!: IOOTCore;

    previousInventoryState!: IInventory;
    previousChestState!: Buffer;
    prepareChestSend: boolean = false;
    saveInit: boolean = false;
    prevInv!: IInventory;
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
        if (!this.saveInit) this.prevInv = this.core.save.inventory;

        // this.ModLoader.logger.debug(this.core.link.state.toString())

        if (this.core.link.state == LinkState.GETTING_ITEM) this.prepareChestSend = true;

        if (this.prepareChestSend && this.core.link.state == LinkState.STANDING) bus.emit(AutotrackerEvents.ON_CHEST_OPENED)
    }

    getLiveScenedData(): void {
        var buf = this.core.global.liveSceneData_chests;
        this.ModLoader.logger.debug(`Scene: ${this.core.global.scene} Chests: ${buf.toJSON().data[3].toString(2)}`);
        // var data = Buffer.from(buf.toJSON().data, 'base64');
    }

    @EventHandler(OotEvents.ON_SAVE_LOADED)
    onSaveLoaded(): void {
        this.ModLoader.logger.info(`Sent current game-state to tracker`);
        this.saveLoaded = true;
        this.sendState(0, {save: this.core.save})
        setInterval(() => {this.getLiveScenedData()}, 10000)
    }

    @EventHandler(OotEvents.ON_SCENE_CHANGE)
    onSceneChange(): void {
        this.ModLoader.logger.info(`Sent current scene to tracker`);
        this.sendSaveState();
        this.sendState(1, {scene: this.core.global.scene})
        this.previousChestState = this.core.global.liveSceneData_chests;
    }

    @EventHandler(OotEvents.ON_HEALTH_CHANGE)
    onHealthChange() {
        this.ModLoader.logger.info(`Sent current game-state to tracker (Health Change)`);
        this.sendSaveState();
    }

    @EventHandler(AutotrackerEvents.ON_CHEST_OPENED)
    onChestOpened() {
        var chestOpened = this.core.global.liveSceneData_chests.toJSON().data[3] ^ this.previousChestState.toJSON().data[3];
        this.ModLoader.logger.debug("Sending save packet (Chest Update)");
        this.sendSaveState();
        this.ModLoader.logger.debug(`Current: ${this.core.global.liveSceneData_chests.toJSON().data[3].toString(2)}`);
        this.ModLoader.logger.debug(`Previous: ${this.previousChestState.toJSON().data[3].toString(2)}`);
        this.ModLoader.logger.debug(`Chest Opened: ${chestOpened.toString()}`);
        // this.sendChestState(chestOpened)
        this.prepareChestSend = false;
        this.previousChestState = this.core.global.liveSceneData_chests;
    }

    sendState(payload: number, state: object) {
        this.wss.clients.forEach((connectedClient) => {
            connectedClient.send(JSON.stringify({payload, data: state})) // Send Scene State
        })
    }

    sendSaveState() {
        this.sendState(0, {save: this.core.save})
    }

    sendChestState(chestOpened) {
        this.sendState(5, { scene: this.core.global.scene, chestOpened })
    }
}

module.exports = autotracker_plugin;