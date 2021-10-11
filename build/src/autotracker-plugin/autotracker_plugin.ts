import {IPlugin, IModLoaderAPI　} from 'modloader64_api/IModLoaderAPI';
import {IInventory, IOOTCore, OotEvents} from 'modloader64_api/OOT/OOTAPI';
import {InjectCore} from 'modloader64_api/CoreInjection';
import { EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { Server } from 'ws';

import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';

import { NetworkHandler, ServerNetworkHandler } from 'modloader64_api/NetworkHandler';

class autotracker_plugin implements IPlugin　{

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;

    @InjectCore()
    core!: IOOTCore;

    previousInventoryState!: IInventory;
    lastPacket!: object;
    wss!: Server;

    preinit(): void {
    }
    init(): void {
        this.wss;
        try {
            this.wss = new Server({ port: 8080 }).on("error", () => {
                this.wss = new Server({ port: 19420 })
            })
        } catch (e) {
            console.log(e)
        }
        this.ModLoader.logger.info("AutoTracker WebSocket initalized on port 8080")

        this.wss.on('connection', (socket) => {
            socket.on('message', (data) => {
                let json = JSON.parse(data.toString());
                console.log(data)
                switch (json["PAYLOAD"]) {
                    case 0:
                        this.ModLoader.logger.info(`Sent current game-state for tracker request`);
                        this.sendState(0, {save: this.core.save})
                        break

                    case 1:
                        socket.send("NOT_INITALIZED")
                        break

                    case 2:
                        let json = JSON.parse(data.toString())
                        this.ModLoader.clientSide.sendPacket(new TrackerUpdate(data.toString(), this.ModLoader.clientLobby))
                        break
                }
            })
        })
        
        setInterval(() => console.log(this.core.global.liveSceneData_chests), 5000)
    }
    postinit(): void {
    }
    onTick(frame?: number | undefined): void {
        if (!this.core.link.exists) { return }
    }

    @EventHandler(OotEvents.ON_SAVE_LOADED)
    onSaveLoaded(): void {
        this.ModLoader.logger.info(`Sent current game-state to tracker`);
        this.sendState(0, {save: this.core.save})
        setInterval(() => {this.sendState(0, {save: this.core.save})}, 10000)
    }

    @NetworkHandler("TrackerUpdate")
    onClientItemGet(packet: TrackerUpdate): void
    {
        var data: string = packet.data
        this.sendState(3, JSON.parse(data).data)
    }

    @EventHandler(OotEvents.ON_SCENE_CHANGE)
    onSceneChange(): void {
        this.ModLoader.logger.info(`Sent current scene to tracker`);
        this.sendState(1, {scene: this.core.global.scene})
    }

    sendState(payload: number, state: object) {
        this.wss.clients.forEach((connectedClient) => {
            connectedClient.send(JSON.stringify({payload, data: state})) // Send Scene State
        })
    }
}

export class TrackerUpdate extends Packet
{
    data: string;
  
    constructor(data: string, lobby: string)
    {
        super("TrackerUpdate", "MultiTracker", lobby, true);

        this.data = data
    }
}


module.exports = autotracker_plugin;