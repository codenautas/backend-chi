"use strict";
import {field, rowDefinition} from "./engine"; 

const campos = {
    usuario       : new field.text({}),
    rol           : new field.text({}),
    activo        : new field.boolean({default:true}),
    bloqueado_hasta:new field.timestamp({}),
    nombre        : new field.text({}),
    apellido      : new field.text({}),
    telefono      : new field.text({title:'teléfono'}),
    mail          : new field.text({}),
    mail_alternativo: new field.text({}),
    clave_nueva   : new field.text({clientSide:'newPass', allow:{select:false, update:true, insert:false}}),
}

export const usuarios = rowDefinition({
    name:'usuarios',
    elementName:'usuario',
    colectionName:'usuarios del sistema',
    editable:true,
    field:campos,
    primaryKey:['usuario']
});
