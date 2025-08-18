export class PropSchema {
    constructor({ name, type, app, label, description, optional, default: defaultValue, options, reloadProps, remoteOptions }) {
        this.name = name;
        this.type = type || 'string' || "app";
        this.app = app || null; // "serpapi"
        this.label = label || name;
        this.description = description || '';
        this.options = options || null; // str[] || [{lable: , value:  }]
        this.optional = optional || false;
        this.default = defaultValue;
        this.reloadProps = reloadProps || false;
        this.remoteOptions = remoteOptions || false;
    }

    toConfigurable() {
        return {
            name: this.name,
            label: this.label,
            type: this.type,
            app: this.app,
            description: this.description,
            optional: this.optional,
            default: this.default,
            reloadProps: this.reloadProps,
            remoteOptions: this.remoteOptions,
            options: this.formatOptions(this.options)
        };
    }

    formatOptions(options) {
        if (!options) return null;
        return options.map(opt => 
            typeof opt === 'string' ? { label: opt, value: opt } : opt
        );
    }
}