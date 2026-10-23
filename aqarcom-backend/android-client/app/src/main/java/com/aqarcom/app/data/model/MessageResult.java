package com.aqarcom.app.data.model;

/** Generic small result objects: { message } / { registered } / { deleted } ... */
public class MessageResult {
    public String message;
    public Boolean registered;
    public Boolean removed;
    public Boolean deleted;
    public Boolean loggedOut;
    public Integer updated;
    public Integer unread;
    public String propertyId;
    public Boolean isFavorite;
}
