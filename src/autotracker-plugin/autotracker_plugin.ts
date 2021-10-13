import {IPlugin, IModLoaderAPI, ILogger} from 'modloader64_api/IModLoaderAPI';
import {AmmoUpgrade, IInventory, IOOTCore, LinkState, OotEvents} from 'modloader64_api/OOT/OOTAPI';
import {InjectCore} from 'modloader64_api/CoreInjection';
import { bus, EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { Server } from 'ws';

import { NetworkHandler, } from 'modloader64_api/NetworkHandler';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';


enum PacketStates {
    INVENTORY_STATE,
    SCENE_STATE
}

enum AutotrackerEvents {
    ON_CHEST_OPENED = 'Autotracker:onChestOpened',
    ON_COLLECTABLE_GATHERED = 'Autotracker:onCollectableGathered',
    ON_SKULLTULA_GATHERED = 'Autotracker:onSkulltulaGathered',
}

enum AutotrackerPayloads {
    CONNECTED_SAVE_REQUEST,
    NOT_INITALIZED,
    TRACKER_UPDATE,
}

enum MultiworldTrackerPayloads {
    SEND_SAVE,
    SEND_SCENE,
    SEND_CHEST_CHANGE,
    SEND_COLLECTABLE_CHANGE,
    SEND_SKULLTULA_CHANGE,
    UNUSED,
}

type AutotrackerData = {
    index: number,
    object: number,
}

export class TrackerUpdate extends Packet {
    data: string;
  
    constructor(data: string, lobby: string) {
        super("TrackerUpdate", "MultiTracker", lobby, true);
        this.data = data
    }
}

class autotracker_plugin implements IPlugin {

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;

    saveLoaded: boolean = false;

    @InjectCore()
    core!: IOOTCore;

    previousChestState!: Buffer;
    previousCollectableState!: Buffer;
    previousSkulltulaState!: Buffer;
    prepareItemSend: boolean = false;
    skulltula: AutotrackerData = {index: 0, object: 0};
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
                    case AutotrackerPayloads.CONNECTED_SAVE_REQUEST:
                        this.ModLoader.logger.info(`Sent current game-state for tracker request`);
                        let payload = {}
                        this.sendState(0, {save: this.core.save})
                        break

                    case AutotrackerPayloads.NOT_INITALIZED:
                        socket.send("NOT_INITALIZED")
                        break
                    case AutotrackerPayloads.TRACKER_UPDATE:
                        // let json = JSON.parse(data.toString()) // Unused code??
                        this.ModLoader.clientSide.sendPacket(new TrackerUpdate(data.toString(), this.ModLoader.clientLobby))
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

        // Run event checks every 20 frames (~1 second)
        if (frame !== undefined && frame % 20 == 0) {
            if (this.core.link.state == (LinkState.BUSY || LinkState.LOADING_ZONE)) return;

            this.previousSkulltulaState.forEach((v, i) => {
                var cur = this.core.save.skulltulaFlags;
                if (this.skulltula.object) return;
                if ((v ^ cur[i]) != 0)
                    this.skulltula = {index: i, object: (v ^ cur[i])};
            });

            if (this.skulltula.object) {
                bus.emit(AutotrackerEvents.ON_SKULLTULA_GATHERED, {index: this.skulltula.index, skulltula: this.skulltula.object});
                this.previousSkulltulaState = this.core.save.skulltulaFlags;
                this.skulltula = {index: 0, object: 0};
            }
        }

        if (this.core.link.state == LinkState.BUSY) this.prepareItemSend = true;

        // TODO: Re-write to test against all bytes
        // Run events checks after the Item Gathered animation finishes
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
    
    @NetworkHandler("TrackerUpdate")
    onClientItemGet(packet: TrackerUpdate): void
    {
        var data: string = packet.data
        this.sendState(3, JSON.parse(data).data)
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
        this.ModLoader.logger.debug("Sending save packet (Collectable Update)");
        this.sendSaveState();

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
        this.sendState(MultiworldTrackerPayloads.SEND_CHEST_CHANGE, { scene: this.core.global.scene, chest: chestOpened })
    }

    sendCollectableState(collectableGathered) {
        this.sendState(MultiworldTrackerPayloads.SEND_CHEST_CHANGE, { scene: this.core.global.scene, collectable: collectableGathered})
    }

    sendSkulltulaState(skulltulaGathered) {
        this.sendState(MultiworldTrackerPayloads.SEND_SKULLTULA_CHANGE, { skulltula: skulltulaGathered })
    }
}


module.exports = autotracker_plugin;