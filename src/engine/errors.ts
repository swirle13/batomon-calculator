/**
 * Thrown by `simulate()` when a `TeamConfiguration` violates data-model.md's validation rules.
 * See contracts/engine-api.md.
 */
export class InvalidTeamConfigurationError extends Error {
  public readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "InvalidTeamConfigurationError";
    this.field = field;
  }
}
