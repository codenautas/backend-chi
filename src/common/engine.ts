import * as BestGlobals from "best-globals";
import {strict as likeAr} from "like-ar";
import json4all = require("json4all");
import * as BP from "backend-plus";

// @ts-ignore currentGlobalScope para acá o allá
var currentGlobalScope = typeof window === 'object'?window:global;

if(!('json4allSpace' in currentGlobalScope)){
    var json4allSpace = {}
    json4all.RefStoreSpace(json4allSpace);
    // @ts-ignore
    currentGlobalScope.json4allSpace = json4allSpace;
}

export type PublicMethod<Name extends string='method1'|'method2'> = ({className:'global'} | {className:Name, idLength:number} ) & {sessionId?:boolean}

export type SessionId = 'S.101010101'|'P.303030303'|'etc...'

export class CodeError extends Error{
    constructor(code:string){
        super("error "+code);
        //@ts-ignore
        this.code=code;
    }
    getNewId(prefix:string){
        var id = prefix+'.'+Math.random().toString().slice(2) as SessionId;
        return id;
    }
}

export const RefStore = json4all.RefStore;

export class SessionData {
    username:string|undefined
}

///////////////////////////// FIELDS ///////////////////////////////////////////


// must be the same that in Backend Plus
type PgKnownTypes = 'decimal'|'text'|'boolean'|'integer'|'bigint'|'date'|'interval'|'timestamp'|'jsonb'|'double'|'bytea'|'jsona';

// const SETTYPENAME=Symbol("SET_TYPE_NAME")

type CommonFieldOptions<T> = {
    default?:T
    nullable?:boolean
    isPk?:number
    generatedAs?:string
    sequence?:null
    title?:string
    editable?:boolean
    allow?:{
        select?:boolean
        update?:boolean
        insert?:boolean
        delete?:boolean
    }
    registerAsDetail?:Partial<BP.DetailTable> & {abr:string}
    isName?:boolean
}

export abstract class Field<T> {
    abstract pgType:string
    backendOnly?:boolean
    get typeName():PgKnownTypes{
        throw new Error("no typeName in field");
    }
    constructor(public inner:CommonFieldOptions<T>){}
    get definition(){
        return this.inner;
    }
    get default():T|undefined{ return this.inner.default }
    _name:string|undefined
    get name(){
        if(!this._name) throw new CodeError("field without name")
        return this._name;
    }
    set name(value:string){ this._name=value }
    _table:RowDefinition<any>|undefined
    get table(){
        if(!this._table) throw new CodeError("field without table")
        return this._table;
    }
    set table(value:RowDefinition<any>){ this._table=value }
    refTable:RowDefinition<any>|undefined
    refName:string|undefined
    parse(_str:string):T|null{
        throw new Error("parse not implemented")
    }
    clone(def:CommonFieldOptions<T>):Field<T>{
        var {sequence, ...rest} = this.inner;
        var cnstrctr = this.constructor;
        // @ts-ignore No sé qué tipo ponerle al constructor de this
        var cloned = new cnstrctr({...rest, ...def});
        cloned.refName = this._name;
        cloned.refTable = this.table;
        return cloned;
    }
}

export class text extends Field<string> {
    pgType='text'
    override parse(str:string){ return str==null || str.trim()==''?null:str }

}

var falseInitials:{[k:string]:boolean}={'n':true,'N':true,'0':true,'2':true,'F':true,'f':true,'\u043d':true,'\u041d':true,'\u0147':true,'\u0148':true};
export class booleanField extends Field<boolean> {
    pgType='boolean'
    override parse(str:string){ return str==null || str.trim()==''?null:!falseInitials[str[0]] }
}

export class textArr extends Field<string[]> {
    pgType='text[]'
    override parse(str:string){ return str==null || str.trim()==''?null:str.split(',') }
}
export abstract class numberField extends Field<number> {
    override parse(str:string){ 
        return (
            // @ts-expect-error Necesito usar str con isNaN porque JS lo permite
            isNaN(str)?
            null:Number(str) 
        )
    }
}

export class bigintField extends numberField{
    constructor(inner:CommonFieldOptions<number> | {sequence?:true}){
        super(inner as CommonFieldOptions<number>)
    }
    pgType='bigint'
}

export class decimal extends numberField{
    constructor(inner:CommonFieldOptions<number>){
        super(inner as CommonFieldOptions<number>)
    }
    pgType='decimal'
}

export class date extends Field<BestGlobals.RealDate>{
    pgType='date'
    override parse(str:string){ 
        if(str==null || str.trim()=='') return null;
        if(str.match(/\d{4,}[-/]\d\d?[-/]\d\d?/)){
            return BestGlobals.date.iso(str)
        }else if(str.match(/\d\d?[-/]\d\d?[-/]\d{4,}/)){
            var params = str.split(/[-/]/).reverse().map(s=>Number(s)) as Parameters<typeof BestGlobals.date.ymd>;
            return BestGlobals.date.ymd(...params);
        }
        throw new CodeError("invalid date format")
    }
}

export class timestamp extends Field<BestGlobals.DateTime>{
    pgType='timestamp'
    override parse(str:string){ 
        if(str==null || str.trim()=='') return null;
        return BestGlobals.datetime.iso(str);
    }
}

export function relatedField<Base, TC extends Field<Base>>(field:TC, def:CommonFieldOptions<Base>):TC{
    return field.clone(def) as TC;
}

export const field = {
    text, textArr, 
    boolean: booleanField,
    date,
    timestamp, 
    bigint: bigintField,
    decimal
}

likeAr(field).forEach((def, name)=>Object.defineProperty(def.prototype,'typeName', {get:()=>name}));


///////////////////////////// TABLES ///////////////////////////////////////////

export type RowDefinitionWithoutFields = {
    name:string
    elementName:string
    editable?:boolean
    colectionName?:string // bp.title
    sourceCode?:string
}

export type RowDefinition<Fields extends {[k:string]:Field<any>}> = RowDefinitionWithoutFields & {
    field:Fields
    primaryKey:(keyof Fields & string)[] // no debería ser necesario poner `& string`
    foreignKeys?:{references:string, fields:(keyof Fields & string|{source:keyof Fields & string, target:string})[]}[]
    detailTables?:BP.DetailTable[]
}

export function completeField(fields:RowDefinition<any>["field"], tableDef:RowDefinition<any>, moreProps:{}){
    likeAr(fields).forEach((field, name)=>{
        field.name = name as string;
        field.table = tableDef;
        likeAr(moreProps).forEach((value, prop)=>{ field[prop] = value })
    });
}

export function calculateFkAndCompleteDetails(allField:RowDefinition<any>["field"], tableDef:RowDefinition<any>):BP.ForeignKey[]{
    var preparingFK = {} as {
        [k:string]: {
            fields:Field<any>[]
            registerAsDetail:CommonFieldOptions<any>["registerAsDetail"]
            refTable:RowDefinition<any>
        }
    }
    likeAr(allField).forEach((field:Field<any>)=>{
        if(field.refTable){
            if(!preparingFK[field.refTable.name]){
                preparingFK[field.refTable.name] = {
                    fields: [], 
                    registerAsDetail: field.inner.registerAsDetail,
                    refTable: field.refTable
                };
            }
            preparingFK[field.refTable.name].fields.push(field)
        }
    })
    var foreignKeys:BP.ForeignKey[] = tableDef.foreignKeys||[];
    likeAr(preparingFK).map((info, target)=>{
        var fields = info.fields.map(f=>f.name==f.refName?f.name:{source:f.name, target:f.refName as string});
        if(info.registerAsDetail?.abr){
            if(info.refTable.detailTables == null){
                info.refTable.detailTables = [];
            }
            var newDetail = {table: tableDef.name, abr:info.registerAsDetail.abr, fields};
            if(info.refTable.detailTables.filter(d=>d.table == newDetail.table && d.abr == newDetail.abr && JSON.stringify(d.fields) == JSON.stringify(fields)).length==0){
                info.refTable.detailTables.push(newDetail);
            }
        }
        var nuevaFk = {references:target as string, fields, alias:target as string};
        if(foreignKeys.filter(fk=>(fk.alias == nuevaFk.alias && JSON.stringify(fk.fields) == JSON.stringify(nuevaFk.fields) && fk.references == fk.references)).length==0){
            foreignKeys.push(nuevaFk)
        }
    }).array();
    return foreignKeys;
}

export function rowDefinition<Fields extends {[k:string]:Field<any>}>(tableDef:RowDefinition<Fields>):RowDefinition<Fields>{
    completeField(tableDef.field, tableDef, {});
    tableDef.foreignKeys = calculateFkAndCompleteDetails(tableDef.field, tableDef);
    return tableDef;
}


type FieldsOf<T> =T extends RowDefinition<infer Field> ? Field : never;
type TsDirectType<F> = F extends Field<infer T> ? T : never
type TsDirectTypes<F extends {}> = {[K in keyof F]: TsDirectType<F[K]>} 
export type TsObject<T> = TsDirectTypes<FieldsOf<T>>


export class Engine{
    static defaultPublicMethods:{[name:string]:PublicMethod}={};
    publicMethods:{[name:string]:PublicMethod}=Engine.defaultPublicMethods;
    SessionData: typeof SessionData = SessionData
}