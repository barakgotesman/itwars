/**
 * Registry of live rooms: creates them with unique codes and deletes them when they empty out.
 */
import { CODE_ALPHABET, CODE_LEN } from '../shared/constants';
import { Room } from './room';

/** Owns every `Room` on this server, keyed by join code. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  /** All live rooms (for the tick loop). */
  all(): IterableIterator<Room> {
    return this.rooms.values();
  }

  /** Number of live rooms. */
  get count(): number {
    return this.rooms.size;
  }

  /**
   * Creates a room with a fresh random code.
   * @returns The new room.
   */
  create(): Room {
    let code: string;
    do {
      code = '';
      for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    } while (this.rooms.has(code));
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Looks a room up by code.
   * @param code - Normalised code.
   */
  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Deletes the room if nobody is left in it. */
  prune(room: Room): void {
    if (room.isEmpty) this.rooms.delete(room.code);
  }
}
