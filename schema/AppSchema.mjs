export class AppSchema {
    constructor({ id, name_slug, name, auth_type, description, img_src, categories, custom_fields_json}) {
        this.id = id;
        this.name_slug = name_slug;
        this.name = name;
        this.auth_type = auth_type;
        this.description = description || "";
        this.img_src = img_src || null;
        this.categories = categories || [];
        this.custom_fields_json = custom_fields_json || "[]";
    }

    toJSON() {
        return {
            id: this.id,
            name_slug: this.name_slug,
            name: this.name,
            auth_type: this.auth_type,
            description: this.description,
            img_src: this.img_src,
            categories: this.categories,
            custom_fields_json: this.custom_fields_json
        };
    }
}