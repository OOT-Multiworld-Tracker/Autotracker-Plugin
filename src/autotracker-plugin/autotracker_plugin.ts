import {IPlugin, IModLoaderAPI, ILogger} from 'modloader64_api/IModLoaderAPI';
import {IOOTCore, LinkState, OotEvents} from 'modloader64_api/OOT/OOTAPI';
import {InjectCore} from 'modloader64_api/CoreInjection';
import { bus, EventHandler } from 'modloader64_api/EventHandler';
import { Server } from 'ws';

import { NetworkHandler, } from 'modloader64_api/NetworkHandler';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';

import { JSONTemplate } from 'modloader64_api/JSONTemplate';
import { IActor } from 'modloader64_api/OOT/IActor';

enum AutotrackerEvent {
    ON_CHEST_OPENED = 'Autotracker:onChestOpened',
    ON_COLLECTABLE_GATHERED = 'Autotracker:onCollectableGathered',
    ON_SKULLTULA_GATHERED = 'Autotracker:onSkulltulaGathered',
    ON_SAVE_EVENT = 'Autotracker:onSaveEvent',
    ON_PERM_SCENE_DATA_CHANGE = 'Autotracker:onPermSceneDataChange',
}

enum AutotrackerPayload {
    CONNECTED_SAVE_REQUEST,
    NOT_INITALIZED,
    TRACKER_UPDATE,
}

enum MultiworldTrackerPayload {
    SEND_SAVE,
    SEND_SCENE,
    SEND_CHEST_CHANGE,
    SEND_COLLECTABLE_CHANGE,
    SEND_SKULLTULA_CHANGE,
    SEND_EVENT_CHANGE,
    SEND_OTHER_TRACKER,
    SEND_SCRUB_BUY,
}

class AutotrackerData extends JSONTemplate {
    index: number = 0;
    object: number = 0;

    constructor() {
        super();
        this.jsonFields = ["index", "object"];
    }

    toString(): string {
        var s = JSON.stringify(this.toJSON());
        return s;
    }
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

    previousRupees!: number;

    previousChestState!: Buffer;
    previousCollectableState!: Buffer;
    previousSkulltulaState!: Buffer;
    previousEventState!: Buffer;

    previousSwitchState!: Buffer;
    previousPermSceneState!: Buffer;

    skulltulaGathered: boolean = false;
    prepareItemSend: boolean = false;

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
                    case AutotrackerPayload.CONNECTED_SAVE_REQUEST:
                        this.ModLoader.logger.info(`Sent current game-state for tracker request`);
                        let payload = {}
                        this.sendState(0, {save: this.core.save})
                        break

                    case AutotrackerPayload.NOT_INITALIZED:
                        socket.send("NOT_INITALIZED")
                        break
                    case AutotrackerPayload.TRACKER_UPDATE:
                        // let json = JSON.parse(data.toString()) // Unused code??
                        this.ModLoader.clientSide.sendPacket(new TrackerUpdate(data.toString(), this.ModLoader.clientLobby))
                        break
                }
            })
        })
    }

    postinit(): void {}

    onTick(frame?: number | undefined): void {
        if (!this.core.link.exists) { return }
        if (!this.saveLoaded) return;

        // Run event checks every 20 frames (~1 second)
        if (frame !== undefined && frame % 20 == 0) {
            if (this.core.link.state == (LinkState.BUSY || LinkState.LOADING_ZONE)) return;

            this.testItemState(this.previousSkulltulaState, MultiworldTrackerPayload.SEND_SKULLTULA_CHANGE);
            this.testItemState(this.previousCollectableState, MultiworldTrackerPayload.SEND_COLLECTABLE_CHANGE);
        }

        if (this.core.link.state == LinkState.GETTING_ITEM) this.prepareItemSend = true;

        if (this.prepareItemSend && this.core.link.state == LinkState.STANDING) {
            this.testItemState(this.previousChestState, MultiworldTrackerPayload.SEND_CHEST_CHANGE);
            this.testItemState(this.previousEventState, MultiworldTrackerPayload.SEND_EVENT_CHANGE);

            this.prepareItemSend = false;
        }
    }
    
    @NetworkHandler("TrackerUpdate")
    onClientItemGet(packet: TrackerUpdate): void
    {
        var data: string = packet.data
        this.sendState(MultiworldTrackerPayload.SEND_OTHER_TRACKER, JSON.parse(data).data)
    }

    @EventHandler(OotEvents.ON_SAVE_LOADED)
    onSaveLoaded(): void {
        this.ModLoader.logger.info(`Sent current game-state to tracker`);
        this.saveLoaded = true;
        this.sendState(0, {save: this.core.save})

        this.previousSkulltulaState = this.core.save.skulltulaFlags;
        this.previousEventState = this.core.save.eventFlags;

        this.previousPermSceneState = this.core.save.permSceneData;

        // DEBUG: Used for skulltula testing
        // this.core.save.inventory.bombs = true;
        // this.core.save.inventory.bombBag = AmmoUpgrade.MAX;
        // this.core.save.inventory.bombsCount = 40;

        // this.core.save.inventory.dekuSticks = true;
        // this.core.save.inventory.dekuSticksCapacity = AmmoUpgrade.MAX;
        // this.core.save.inventory.dekuSticksCount = 30;

        // this.core.commandBuffer.runWarp(0x5A4, 16, ()=>{})
        // this.core.save.shields.dekuShield = true;
        // this.core.save.swords.kokiriSword = true;
        // this.core.save.rupee_count = 99;
    }

    @EventHandler(OotEvents.ON_SCENE_CHANGE)
    onSceneChange(): void {
        this.ModLoader.logger.info(`Sent current scene to tracker`);
        this.sendSaveState();
        this.sendState(1, {scene: this.core.global.scene})

        this.previousChestState = this.core.global.liveSceneData_chests;
        this.previousCollectableState = this.core.global.liveSceneData_collectable;
        this.previousSkulltulaState = this.core.save.skulltulaFlags;

        // DEBUG Switch state
        this.previousSwitchState = this.core.global.liveSceneData_switch;
    }

    @EventHandler(OotEvents.ON_HEALTH_CHANGE)
    onHealthChange() {
        this.ModLoader.logger.info(`Sent current game-state to tracker (Health Change)`);
        this.sendSaveState();
    }

    @EventHandler(AutotrackerEvent.ON_CHEST_OPENED)
    onChestOpened(chestOpened: AutotrackerData) {
        this.ModLoader.logger.debug("Sending save packet (Chest Update)");
        this.sendSaveState();
        this.ModLoader.logger.debug(`Chest Opened: ${chestOpened.toString()}`);
        this.sendChestState(chestOpened)
    }

    @EventHandler(AutotrackerEvent.ON_COLLECTABLE_GATHERED)
    onCollectableGathered(collectableGathered: AutotrackerData) {
        this.ModLoader.logger.debug("Sending save packet (Collectable Update)");
        this.sendSaveState();
        this.ModLoader.logger.debug(`Collectable Gathered: ${collectableGathered.toString()}`);
        this.sendCollectableState(collectableGathered);
    }

    @EventHandler(AutotrackerEvent.ON_SKULLTULA_GATHERED)
    onSkulltulaGathered(skulltula: AutotrackerData) {
        this.ModLoader.logger.debug("Sending save packet (Skulltula Update)");
        this.sendSaveState();
        this.ModLoader.logger.debug(`Skulltula Gathered: ${skulltula.toString()}`);
        this.sendSkulltulaState(skulltula);
    }

    @EventHandler(AutotrackerEvent.ON_SAVE_EVENT)
    onSaveEvent(event: AutotrackerData) {
        this.ModLoader.logger.debug("Sending save packet (Event Update)");
        this.sendSaveState();
        this.ModLoader.logger.debug(`Event Changed: ${event.toString()}`);
        this.sendEventState(event);
    }

    @EventHandler(OotEvents.ON_ACTOR_SPAWN)
    onActorSpawn(actor: IActor) {
        if (actor.actorType == 1 && actor.actorID == 282) {
            this.previousRupees = this.core.save.rupee_count;
        }
    }

    @EventHandler(OotEvents.ON_ACTOR_DESPAWN)
    onActorDespawn(actor: IActor) {
        if (actor.actorType == 1 && actor.actorID == 282 && this.previousRupees != this.core.save.rupee_count)
            this.sendState(MultiworldTrackerPayload.SEND_SCRUB_BUY, {scene: this.core.global.scene, data: `[${actor.position.getRawPos().toJSON().data.toString()}]`})
    }

    sendState(payload: number, state: object) {
        this.wss.clients.forEach((connectedClient) => {
            connectedClient.send(JSON.stringify({payload, data: state})) // Send Scene State
        })
    }

    sendSaveState() {
        this.sendState(MultiworldTrackerPayload.SEND_SAVE, {save: this.core.save})
    }

    sendChestState(chestOpened: AutotrackerData) {
        this.sendState(MultiworldTrackerPayload.SEND_CHEST_CHANGE, { scene: this.core.global.scene, data: chestOpened.toString() })
    }

    sendCollectableState(collectableGathered: AutotrackerData) {
        this.sendState(MultiworldTrackerPayload.SEND_COLLECTABLE_CHANGE, { scene: this.core.global.scene, data: collectableGathered.toString() })
    }

    sendSkulltulaState(skulltulaGathered: AutotrackerData) {
        this.sendState(MultiworldTrackerPayload.SEND_SKULLTULA_CHANGE, { data: skulltulaGathered.toString() })
    }

    sendEventState(eventChanged: AutotrackerData) {
        this.sendState(MultiworldTrackerPayload.SEND_EVENT_CHANGE, { data: eventChanged.toString() })
    }

    testItemState(previousState: Buffer, payload: MultiworldTrackerPayload) {
        var item: AutotrackerData = new AutotrackerData();

        switch (payload) {
            case MultiworldTrackerPayload.SEND_CHEST_CHANGE:
                var currentState = this.core.global.liveSceneData_chests;
                var event: AutotrackerEvent = AutotrackerEvent.ON_CHEST_OPENED;
                break;

            case MultiworldTrackerPayload.SEND_SKULLTULA_CHANGE:
                var currentState = this.core.save.skulltulaFlags;
                var event: AutotrackerEvent = AutotrackerEvent.ON_SKULLTULA_GATHERED;
                break;

            case MultiworldTrackerPayload.SEND_COLLECTABLE_CHANGE:
                var currentState = this.core.global.liveSceneData_collectable;
                var event: AutotrackerEvent = AutotrackerEvent.ON_COLLECTABLE_GATHERED;
                break;

            case MultiworldTrackerPayload.SEND_EVENT_CHANGE:
                var currentState = this.core.save.eventFlags;
                var event: AutotrackerEvent = AutotrackerEvent.ON_SAVE_EVENT;
                break;

            default:
                return;
        }

        previousState.forEach((v, i) => {
            if (item.object) return;
            if ((v ^ currentState[i]) != 0) {
                item.index = i;
                item.object = v ^ currentState[i];
            }
        });

        if (item.object) {
            bus.emit(event, item);
            previousState = currentState;

            switch (payload) {
                case MultiworldTrackerPayload.SEND_CHEST_CHANGE:
                    this.previousChestState = currentState;
                    break;

                case MultiworldTrackerPayload.SEND_SKULLTULA_CHANGE:
                    this.previousSkulltulaState = currentState;
                    break;

                case MultiworldTrackerPayload.SEND_COLLECTABLE_CHANGE:
                    this.previousCollectableState = currentState
                    break;
                
                case MultiworldTrackerPayload.SEND_EVENT_CHANGE:
                    this.previousEventState = currentState;
                    break;
            }
        }
    }
}


module.exports = autotracker_plugin;
