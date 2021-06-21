import { Engine, Field, RowDefinition, SessionId, completeField, calculateFkAndCompleteDetails } from "../common/engine"
import * as BP from "backend-plus";
import {strict as likeAr} from "like-ar";
import * as json4all from "json4all";
import {promises as fs} from "fs";
import * as Path from "path";

export type TableDefinitionPrivateProperties = {
    sql?:{
        isTable?:boolean
        from?:string
    }
    dynamicAdapt?:(tableDefinition:BP.TableDefinition, context:BP.TableContext)=>BP.TableDefinition
}

export type TableDefinition<Fields extends {[k:string]:Field<any>}, PrivateFields extends {[k:string]:Field<any>}> = 
    RowDefinition<Fields> & TableDefinitionPrivateProperties 
& {
    privateField:PrivateFields
}

export function tableDefinition<Fields extends {[k:string]:Field<any>}, PrivateFields extends {[k:string]:Field<any>}>(
    tableDef:RowDefinition<Fields>,     
    privateField: PrivateFields,
    privateProperties: TableDefinitionPrivateProperties
):TableDefinition<Fields, PrivateFields>{
    completeField(privateField, tableDef, {backendOnly:true});
    return {
        ...tableDef,
        privateField,
        ...privateProperties
    };
}

//export function generateTableDefinition<Fields extends {[k:string]:Field<any>}>(table:TableDefinition<Fields>){
export function generateTableDefinition(tableDef:TableDefinition<any, any>|RowDefinition<any>){
    var {field, colectionName, privateField, dynamicAdapt, ...newTableDef} = tableDef as TableDefinition<any, any>;
    var allField = {...field, ...privateField};
    newTableDef.foreignKeys = calculateFkAndCompleteDetails(allField, tableDef);
    return function (context:BP.TableContext):BP.TableDefinition{
        function field2BpField(def:Field<any>, name:keyof any):BP.FieldDefinition{
            return {
                name: name as string, 
                typeName: def.typeName, 
                ...def.definition,
                allow:{
                    ...def.definition.allow,
                    ...(def.backendOnly?{select:context.forDump}:{})
                }
            };
        }
        var fields:BP.FieldDefinition[] = [
            ...likeAr(allField).map(field2BpField).array(),
        ]
        return (dynamicAdapt?dynamicAdapt:<T>(x:T)=>x)({
            ...newTableDef, 
            fields, 
            title:colectionName
        }, context);
    }
}

export class BackendEngine extends Engine{
    staticIncludes:BP.ClientModuleDefinition[]=[]
    getTableDefinition():{[k:string]:(context:BP.TableContext)=>BP.TableDefinition}{
        return {};
    }
    getIncludes():BP.ClientModuleDefinition[]{
        return this.staticIncludes
    }
    async getIncludesFromDataSetRow(basePath:string, commonPath:string, dataSetRow:{[name:string]:RowDefinition<any>}){
        var seen:{[name:string]:boolean} = {}
        var chain = Promise.resolve();
        likeAr(dataSetRow).forEach(rowDef=>{
            chain = chain.then(async ()=>{
                var filename = rowDef.sourceCode ?? 'row-'+rowDef.name+'.js';
                if(!seen[filename]){
                    seen[filename]=true;
                    try{
                        console.log('incluyendo', {type:'js', src:Path.posix.join(commonPath, filename)})
                        await fs.stat(Path.join(basePath, commonPath, filename));
                        this.staticIncludes.push({type:'js', src:Path.posix.join(commonPath, filename)})
                    }catch(err){
                        console.log(`getIncludesFromDataSetRow: lacks '${filename}' in '${Path.join(basePath, commonPath, filename)}'`)
                        throw err;
                    }
                }
            })
        })
        return chain;
    }
    async asyncPostConfig(){}
}

type InnerSession = {

}

export class AppChi extends BP.AppBackend{
    engine:BackendEngine;
    innerSession = {} as Partial<{[id in SessionId]: InnerSession}>
    dynamicIncludes:BP.ClientModuleDefinition[]=[]
    constructor(init:{engine:BackendEngine}){
        super();
        this.engine = init.engine;
    }
    override async postConfig(){
        await super.postConfig();
        await this.engine.asyncPostConfig();
    }
    /*
    addSchrödingerServices(mainApp:ExpressPlus, baseUrl:string){
        var be=this;
        if(baseUrl=='/'){
            baseUrl='';
        }   
        mainApp.get(baseUrl+'/pub',async function(req,res,_next){
            // @ts-ignore useragent existe
            var {useragent} = req;
            var htmlMain=be.mainPage({useragent}, false, {skipMenu:true}).toHtmlDoc();
            MiniTools.serveText(htmlMain,'html')(req,res);
        });
        super.addSchrödingerServices(mainApp, baseUrl);
    }
    */
    override async getProcedures(){
        var be = this;
        var engineProcedures=likeAr(this.engine.publicMethods).map((def,name)=>(
            {
                action:`engine_${name}`,
                parameters:[
                    {name:'method_args', typeName:'jsonb'},
                ],
                coreFunction: async (context:BP.ProcedureContext, parameters:BP.coreFunctionParameters)=>{
                    var thisObject: object;
                    var method_args:any[] = parameters.method_args;
                    if(def.className=='global'){
                        thisObject = be.engine
                        method_args = parameters.method_args;
                    }else{
                        // @ts-expect-error Todavía no detecta bien que esto está bien 
                        let getter:`get${KnownClassName}` = `get${def.className}`;
                        // ts-expect-error No se puede saber dinámicamente cuántos son, creo
                        thisObject = parameters.method_args[0]
                        method_args = parameters.method_args.slice(def.idLength);
                    }
                    if(def.sessionId){
                        json4all.pretendClass(context.session, this.engine.SessionData); 
                        var sessionId = context.session.id as SessionId;
                        if(!(context.session.id in be.innerSession)){
                            be.innerSession[sessionId] = new this.engine.SessionData();
                        }
                        var session = be.innerSession[sessionId]!
                        method_args[0] = session;
                        // console.log('Session', context.session?.constructor/*?.name*/, name, context.session?.roomId, context.session?.idPlayer)
                    }
                    // @ts-expect-error
                    return (await thisObject[name](...method_args))??null;
                }
            }
        )).array();
        return [
            ...await super.getProcedures(),
            ...engineProcedures,
        ].map(be.procedureDefCompleter, be);
    }
    override getMenu(context:BP.Context):BP.MenuDefinition{
        var menuContent:BP.MenuInfoBase[]=[
        ];
        menuContent.push(
            {menuType:'menu', name:'config', label:'configurar', menuContent:[
                context.user?
                    {menuType:'table', table:'usuarios', name:context.user.rol=="admin"?'usuarios':'usuario'}
                :
                    {menuType:'path', name:'login', path:'./login'},
            ]}
        )
        return {menu:menuContent};
    }
    override clientIncludes(req:BP.Request|null, opts:BP.OptsClientPage):BP.ClientModuleDefinition[]{
        var menuedResources:BP.ClientModuleDefinition[]=req && opts && !opts.skipMenu ? [
            { type:'js' , src:'client.js' },
        ]:[
            {type:'js' , src:'unlogged.js' },
        ];
        var withReact = (this.config["client-setup"]?.react);
        var reactPrevious:BP.ClientModuleDefinition[]=[
            { type: 'js', module: 'react', modPath: 'umd', fileDevelopment:'react.development.js', file:'react.production.min.js' },
            { type: 'js', module: 'react-dom', modPath: 'umd', fileDevelopment:'react-dom.development.js', file:'react-dom.production.min.js' },
            { type: 'js', module: '@material-ui/core', modPath: 'umd', fileDevelopment:'material-ui.development.js', file:'material-ui.production.min.js' },
            { type: 'js', module: 'material-styles', fileDevelopment:'material-styles.development.js', file:'material-styles.production.min.js' },
            { type: 'js', module: 'clsx', file:'clsx.min.js' },
            { type: 'js', module: 'redux', modPath:'../dist', fileDevelopment:'redux.js', file:'redux.min.js' },
            { type: 'js', module: 'react-redux', modPath:'../dist', fileDevelopment:'react-redux.js', file:'react-redux.min.js' },
        ];
        var reactOthers:BP.ClientModuleDefinition[]=[
            { type: 'js', module: 'redux-typed-reducer', modPath:'../dist', file:'redux-typed-reducer.js' },
            { type: 'js', src: 'adapt.js' },
        ]
        return [
            ...(withReact?reactPrevious:[]),
            ...super.clientIncludes(req, opts),
            ...(withReact?reactOthers:[]),
            { type: 'js', src: 'client/tipos.js' },
            { type: 'js', src: 'common/engine.js' },
            { type: 'js', src: 'client/frontend-engine.js' },
            ...this.engine.getIncludes(),
            ... menuedResources
        ];
    }
    override prepareGetTables(){
        super.prepareGetTables();
        this.getTableDefinition=this.engine.getTableDefinition()
    }       
}