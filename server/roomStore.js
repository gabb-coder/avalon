// Where rooms live. The interface is deliberately small and synchronous:
//
//   get(code) → record | undefined     has(code) → boolean
//   set(code, record)                  delete(code)
//   values() → iterable of records     size → number
//
// A record is plain JSON (see RoomManager): the engine state, hashed session
// tokens, the block list and the last-activity time. Timers and sockets are
// never stored; they belong to the running process.
//
// The server runs as a single instance, so rooms are always kept in memory
// and reads stay synchronous. A Redis store (milestone 7) would keep this same
// interface: reads from its own Map, writes passed through to Redis in the
// background, and loadAll() at boot to restore rooms after a restart.

export class MemoryRoomStore {
  #rooms = new Map();

  get(code) {
    return this.#rooms.get(code);
  }

  has(code) {
    return this.#rooms.has(code);
  }

  set(code, record) {
    this.#rooms.set(code, record);
  }

  delete(code) {
    this.#rooms.delete(code);
  }

  values() {
    return this.#rooms.values();
  }

  get size() {
    return this.#rooms.size;
  }
}
