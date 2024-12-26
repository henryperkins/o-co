declare module "orama" {
  export class Orama<T = any> {
    // Add any specific type definitions here if needed
    insert(document: T): Promise<void>;
    search(query: Partial<T>): Promise<T[]>;
  }
}
