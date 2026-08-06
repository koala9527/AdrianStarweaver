export class ObjectPool<T extends { active: boolean }> {
  private pool: T[] = [];
  private activeObjects: T[] = [];
  private factory: () => T;
  private resetFn: (obj: T) => void;
  private hardCap: number;

  constructor(factory: () => T, resetFn: (obj: T) => void, hardCap = Infinity) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.hardCap = hardCap;
  }

  preAllocate(count: number): void {
    for (let i = 0; i < count; i++) {
      const obj = this.factory();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  acquire(): T {
    // Try to reuse an inactive object
    const inactive = this.pool.find(o => !o.active);
    if (inactive) {
      this.resetFn(inactive);
      inactive.active = true;
      if (!this.activeObjects.includes(inactive)) {
        this.activeObjects.push(inactive);
      }
      return inactive;
    }

    // At hard cap — force-recycle the oldest active object
    if (this.pool.length >= this.hardCap) {
      const oldest = this.activeObjects.shift();
      if (oldest) {
        oldest.active = false;
        this.resetFn(oldest);
        oldest.active = true;
        this.activeObjects.push(oldest);
        return oldest;
      }
    }

    // Grow the pool
    const obj = this.factory();
    this.resetFn(obj);
    obj.active = true;
    this.pool.push(obj);
    this.activeObjects.push(obj);
    return obj;
  }

  release(obj: T): void {
    if (!obj.active) return;
    obj.active = false;
    const idx = this.activeObjects.indexOf(obj);
    if (idx !== -1) this.activeObjects.splice(idx, 1);
  }

  releaseAll(): void {
    for (const obj of this.activeObjects) {
      obj.active = false;
    }
    this.activeObjects.length = 0;
  }

  getActiveCount(): number {
    return this.activeObjects.length;
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  getActiveObjects(): readonly T[] {
    return this.activeObjects;
  }
}
