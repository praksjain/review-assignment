/**
 * Abstract base class every plugin must extend.
 *
 * Subclasses must override `get name()` and `async handle(event, settings)`.
 * The default `matches()` checks event_type against settings.event_types,
 * but plugins may override for custom eligibility logic.
 */
class BasePlugin {
  get name() {
    throw new Error("Plugin must implement the 'name' getter");
  }

  async handle(_event, _settings) {
    throw new Error("Plugin must implement handle()");
  }

  matches(event, settings) {
    const allowedTypes = (settings && settings.event_types) || [];
    if (allowedTypes.length === 0) return true;
    return allowedTypes.includes(event.event_type);
  }
}

module.exports = BasePlugin;
