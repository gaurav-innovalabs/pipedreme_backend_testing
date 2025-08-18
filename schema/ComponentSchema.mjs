import { PropSchema } from './PropSchema.mjs';

export class ComponentSchema {
    constructor({ component_type, key, name, description, version, props }) {
        this.key = key; // action.key
        this.name = name; // action.name
        this.description = description; // action.description
        this.component_type = component_type || 'action';
        this.version = version;
        this.configurable_props = props;//props.map(p => p instanceof PropSchema ? p : new PropSchema(p));
    }

    toJSON() {
        return {
            key: this.key,
            name: this.name,
            description: this.description,
            component_type: this.component_type,
            version: this.version,
            configurable_props: this.configurable_props//.map(p => p.toConfigurable())
        };
    }
}