package com.aqarcom.app.data.model;

/** Server envelope: { success, data, meta } or { success:false, error }. */
public class ApiResponse<T> {
    public boolean success;
    public T data;
    public PageMeta meta;
    public ApiError error;
}
