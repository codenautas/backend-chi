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

export function xusuarios(context:TableContext):TableDefinition{
    var admin = context.user.rol==='admin';
    return {
        name:'usuarios',
        editable:admin,
        fields:[
            {name:'usuario'          , typeName:'text'    , nullable:false  },
            {name:'rol'              , typeName:'text'    },
            {name:'md5clave'         , typeName:'text'    , allow:{select: context.forDump} },
            {name:'activo'           , typeName:'boolean' , nullable:false ,defaultValue:false},
            {name:'nombre'           , typeName:'text'                      },
            {name:'apellido'         , typeName:'text'                      },
            {name:'telefono'         , typeName:'text'    , title:'teléfono'},
            {name:'interno'          , typeName:'text'                      },
            {name:'mail'             , typeName:'text'                      },
            {name:'mail_alternativo' , typeName:'text'                      },
            {name:'clave_nueva'      , typeName:'text', clientSide:'newPass', allow:{select:admin, update:true, insert:false}},
        ],
        primaryKey:['usuario'],
        sql:{
            where:admin || context.forDump?'true':"usuario = "+context.be.db.quoteNullable(context.user.usuario)
        }
    };
}
