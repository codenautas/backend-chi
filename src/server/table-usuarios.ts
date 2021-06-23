"use strict";
import { field } from "../common/engine"; 
import { tableDefinition } from "./be-engine"
import { usuarios } from "../common/row-usuarios"; 
import {TableDefinition, TableContext} from "backend-plus";

const campos = {
    md5clave: new field.text({})
}

export const tableUsuarios = tableDefinition(
    usuarios, campos, {
        dynamicAdapt:(tableDef:TableDefinition, context:TableContext)=>{
            tableDef.sql||={};
            tableDef.sql.where =context.user.rol==='admin' || context.forDump?'true':"usuario = "+context.be.db.quoteNullable(context.user.usuario)
            return tableDef;
        }
    },
);
