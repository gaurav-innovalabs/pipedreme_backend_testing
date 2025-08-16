// every components/{app_slug} will contain connection.mjs
with
{
    type: "oauth" || "custom"
    custom_fileds: [
        {
            ... 
        }
    ],
    oauth_details: {
        .. .. . ..
    },
    mehtod: .. .. connection_link:
}
// need proper analisys and planning first as per requirements for the structure just like pipedream as reference, and will first start with serpApi to give custom fields and add one filed as API and secrets: True, type: string
// then do for slack to genertate connection_link method which take oauth_details from env indirectly delated on that filed and use to generate the filed , and callback to host//auth/oauth/:app_slug/callback located on routes/connectlocal.mjs
// that call connect_oauth_callback method on connection.mjs
// it must also have other required mehtods like token refresh, unauth that's it