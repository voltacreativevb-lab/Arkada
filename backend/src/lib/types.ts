export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present once requireWorkerAuth has run. */
      radnik?: {
        id: string;
        prodavnicaId: string;
        ime: string;
      };
      /** Present once requireAdmin has run. */
      adminUserId?: string;
    }
  }
}
