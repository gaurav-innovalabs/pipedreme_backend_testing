export class PageInfo {
    constructor({ total_count, count, start_cursor, end_cursor}) {
        if( total_count == undefined){
            console.log("Total count is undefined, PageInfo sending mock data");
        }
        this.total_count = total_count;
        this.count = count;
        this.start_cursor = start_cursor;
        this.end_cursor = end_cursor;
    }

    toJSON() {
        return {
            total_count: this.total_count,
            count: this.count,
            start_cursor: this.start_cursor,
            end_cursor: this.end_cursor,
        };
    }
}