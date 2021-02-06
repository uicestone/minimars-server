import WebSocket, { Server } from "ws";
import { Store, FaceDevice } from "../models/Store";

type Target = WebSocket | FaceDevice | Store;

export default class Viso {
  devices: FaceDevice[] = [];
  constructor(private wss: Server, stores: Store[]) {
    stores.forEach(store => {
      this.devices = this.devices.concat(
        store.faceDevices.map(d => {
          d.storeCode = store.code;
          return d;
        })
      );
    });
    wss.on("connection", ws => {
      this.getDeviceInfo(ws);
      ws.on("message", msg => {
        const parsed = JSON.parse(msg.toString());
        this.onReturn(parsed.data.payload.command, parsed.data.payload.data);
      });
    });
  }

  sendCommand(target: Target, path: string, payload = {}) {
    let devices: FaceDevice[] = [];
    if (target instanceof FaceDevice) {
      if (!target.ws) {
        console.error(
          `[VSO] Face device ${target.name} websocket not connected.`
        );
        return;
      }
      devices.push(target);
    } else if (target instanceof Store) {
      target.faceDevices.forEach(device => {
        if (!device.ws) {
          console.error(
            `[VSO] Store ${target.code} face device ${device.name} websocket not connected.`
          );
          return;
        }
        devices.push(device);
      });
    } else {
      devices.push(Object.assign(new FaceDevice(), { ws: target }));
    }

    devices.forEach(device => {
      if (!device.ws)
        console.error(
          `[VSO] Face device ${device.name} websocket not connected.`
        );
      device.ws.send(
        JSON.stringify({
          command: "http_request",
          timeStamp: (Date.now() / 1000).toFixed(),
          mac: target instanceof WebSocket ? undefined : device.mac,
          data: {
            url: "api/v1/face/" + path,
            payload
          }
        })
      );
    });
  }

  onReturn(command: Command, payload: any = {}) {
    console.log("[VSO] On return", Command[command], payload);
    switch (command) {
      case Command.GET_DEVICE_INFO:
        const device = this.devices.find(d => d.mac === payload.mac);
        if (!device) {
          console.error(
            `[VSO] Face device ${payload.mac} is not registered under store.`
          );
        }
        console.log(
          `[VSO] Face device ${device.storeCode} ${device.name} connected.`
        );
        break;
    }
  }

  getDeviceInfo(ws: WebSocket) {
    this.sendCommand(ws, "getDeviceInfo");
  }

  addPerson(
    target: Target,
    userId: string,
    name: string,
    age: number,
    gender: "male" | "female",
    phone = "10000000000",
    email: "face@minmi-mars.com",
    images: string[]
  ) {
    this.sendCommand(target, "addPerson", {
      userId,
      name,
      age,
      gender,
      phone,
      email,
      images: images.map(data => ({ data })),
      accessInfo: {}
    });
  }

  queryPerson(target: Target) {
    this.sendCommand(target, "queryPerson");
  }

  addFaces(target: Target, personId: string, images: string[]) {
    this.sendCommand(target, "addFaces", {
      personId,
      images: images.map(data => ({ data }))
    });
  }

  resetPersons(target: Target) {
    this.sendCommand(target, "resetPersons");
  }
}

enum Command {
  GET_DEVICE_INFO = 127
}
