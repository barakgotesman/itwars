/**
 * The office, generated from boxes. Shared so the client renders exactly what the server
 * collides with. Coordinates: x east, z south, y up; the map spans x -50..50, z -35..35.
 *
 * Layout (north is -z):
 *   north row  z -35..-20  Executive | Meeting A | Meeting B | Server room | Print | IT Helpdesk
 *   open plan  z -20..14   12 cubicle pods around a central lounge, with cover set pieces
 *   south row  z  14..35   Break room | Storage | Lobby (open) | Conference | Phone booths
 *
 * Each room lives in `rooms/`; primitives are in `builder.ts`, props in `furniture.ts`.
 * Importing this module builds the map once.
 */
import { boxes, labels, lights } from './builder';
import { buildDressing } from './dressing';
import { buildGlassRooms } from './rooms/glass-rooms';
import { buildMeetingRooms } from './rooms/meeting-rooms';
import { buildExecutive, buildHelpdesk, buildPrintRoom } from './rooms/north-rooms';
import { buildOpenPlan } from './rooms/open-plan';
import { buildServerRoom } from './rooms/server-room';
import { buildBreakRoom, buildConference, buildLobby, buildPhoneLounge, buildStorage } from './rooms/south-rooms';
import { placeAccents } from './accents';
import { buildShell } from './shell';
import type { LabelSpec, LightSource, MapBox } from './types';

export { CEILING_H } from './builder';
export { PICKUP_SPOTS } from './pickups';
export type { PickupSpot } from './pickups';
export type { LabelSpec, LightSource, MapBox, MaterialId } from './types';

buildShell();
buildOpenPlan();
buildGlassRooms();
buildExecutive();
buildMeetingRooms();
buildServerRoom();
buildPrintRoom();
buildHelpdesk();
buildBreakRoom();
buildStorage();
buildLobby();
buildConference();
buildPhoneLounge();
buildDressing();
placeAccents();

/** Door nameplates, banners and wall plaques; the client draws their text. */
export const LABELS: readonly LabelSpec[] = labels;
/** Baked light sources the client turns into vertex lighting. */
export const LIGHTS: readonly LightSource[] = lights;
/** Every box in the map, solid or decorative. */
export const MAP_BOXES: readonly MapBox[] = boxes;
/** Collision boxes only; what `stepMovement` receives. */
export const SOLIDS = boxes.filter((b) => b.solid);
/** Spawn points as `[x, z]` on the floor, spread over every zone. */
export const SPAWNS: readonly [number, number][] = [
  [-33, -8], [33, -8], [-33, 2], [33, 2], [0, -14], [0, 12],
  [-8, -17], [8, -17], [-45, -24], [2, -22], [-27, -23], [-13, -23],
  [17, -22], [37, -27], [-40, 18], [-21, 24], [0, 18], [22, 18], [41, 20], [-3, -3],
  [-1.1, -27], [7.5, -27], [18, -24], [-18.5, -31], [-40, -22],
];
