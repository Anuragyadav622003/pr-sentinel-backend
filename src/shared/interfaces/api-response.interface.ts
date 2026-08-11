export interface ApiSuccessResponse<T = unknown>{
    success:true;
    message:string;
    data:T;
    timestamp:string;
    path?:string
}


export interface ApiErrorResponse{
    success:false;
    message:string;
    error:{
        statusCode:number;
        errors?:string[] | Record <string,unknown>;
        [key:string]:unknown;
    };
    timestamp:string;
    path?:string;
}