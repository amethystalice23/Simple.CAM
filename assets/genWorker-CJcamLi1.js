(function(){var e=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t,t.exports),e=null),t.exports)
/**
* @license
* Copyright 2010-2024 Three.js Authors
* SPDX-License-Identifier: MIT
*/
;let t=1e3,n=1001,r=1002,i=2300,a=2301,o=2302,s=2400,c=2401,l=2402,u=`srgb`,d=`srgb-linear`,f=`linear`,p=2e3;var m=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){if(this._listeners===void 0)return!1;let n=this._listeners;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){if(this._listeners===void 0)return;let n=this._listeners[e];if(n!==void 0){let e=n.indexOf(t);e!==-1&&n.splice(e,1)}}dispatchEvent(e){if(this._listeners===void 0)return;let t=this._listeners[e.type];if(t!==void 0){e.target=this;let n=t.slice(0);for(let t=0,r=n.length;t<r;t++)n[t].call(this,e);e.target=null}}};let h=/* @__PURE__ */ `00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10.11.12.13.14.15.16.17.18.19.1a.1b.1c.1d.1e.1f.20.21.22.23.24.25.26.27.28.29.2a.2b.2c.2d.2e.2f.30.31.32.33.34.35.36.37.38.39.3a.3b.3c.3d.3e.3f.40.41.42.43.44.45.46.47.48.49.4a.4b.4c.4d.4e.4f.50.51.52.53.54.55.56.57.58.59.5a.5b.5c.5d.5e.5f.60.61.62.63.64.65.66.67.68.69.6a.6b.6c.6d.6e.6f.70.71.72.73.74.75.76.77.78.79.7a.7b.7c.7d.7e.7f.80.81.82.83.84.85.86.87.88.89.8a.8b.8c.8d.8e.8f.90.91.92.93.94.95.96.97.98.99.9a.9b.9c.9d.9e.9f.a0.a1.a2.a3.a4.a5.a6.a7.a8.a9.aa.ab.ac.ad.ae.af.b0.b1.b2.b3.b4.b5.b6.b7.b8.b9.ba.bb.bc.bd.be.bf.c0.c1.c2.c3.c4.c5.c6.c7.c8.c9.ca.cb.cc.cd.ce.cf.d0.d1.d2.d3.d4.d5.d6.d7.d8.d9.da.db.dc.dd.de.df.e0.e1.e2.e3.e4.e5.e6.e7.e8.e9.ea.eb.ec.ed.ee.ef.f0.f1.f2.f3.f4.f5.f6.f7.f8.f9.fa.fb.fc.fd.fe.ff`.split(`.`);function g(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(h[e&255]+h[e>>8&255]+h[e>>16&255]+h[e>>24&255]+`-`+h[t&255]+h[t>>8&255]+`-`+h[t>>16&15|64]+h[t>>24&255]+`-`+h[n&63|128]+h[n>>8&255]+`-`+h[n>>16&255]+h[n>>24&255]+h[r&255]+h[r>>8&255]+h[r>>16&255]+h[r>>24&255]).toLowerCase()}function _(e,t,n){return Math.max(t,Math.min(n,e))}function v(e,t){return(e%t+t)%t}function y(e,t,n){return(1-n)*e+n*t}function b(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error(`Invalid component type.`)}}function x(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error(`Invalid component type.`)}}var S=class e{constructor(t=0,n=0){e.prototype.isVector2=!0,this.x=t,this.y=n}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6],this.y=r[1]*t+r[4]*n+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(_(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),r=Math.sin(t),i=this.x-e.x,a=this.y-e.y;return this.x=i*n-a*r+e.x,this.y=i*r+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},C=class e{constructor(t,n,r,i,a,o,s,c,l){e.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,n,r,i,a,o,s,c,l)}set(e,t,n,r,i,a,o,s,c){let l=this.elements;return l[0]=e,l[1]=r,l[2]=o,l[3]=t,l[4]=i,l[5]=s,l[6]=n,l[7]=a,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[3],s=n[6],c=n[1],l=n[4],u=n[7],d=n[2],f=n[5],p=n[8],m=r[0],h=r[3],g=r[6],_=r[1],v=r[4],y=r[7],b=r[2],x=r[5],S=r[8];return i[0]=a*m+o*_+s*b,i[3]=a*h+o*v+s*x,i[6]=a*g+o*y+s*S,i[1]=c*m+l*_+u*b,i[4]=c*h+l*v+u*x,i[7]=c*g+l*y+u*S,i[2]=d*m+f*_+p*b,i[5]=d*h+f*v+p*x,i[8]=d*g+f*y+p*S,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8];return t*a*l-t*o*c-n*i*l+n*o*s+r*i*c-r*a*s}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=l*a-o*c,d=o*s-l*i,f=c*i-a*s,p=t*u+n*d+r*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let m=1/p;return e[0]=u*m,e[1]=(r*c-l*n)*m,e[2]=(o*n-r*a)*m,e[3]=d*m,e[4]=(l*t-r*s)*m,e[5]=(r*i-o*t)*m,e[6]=f*m,e[7]=(n*s-c*t)*m,e[8]=(a*t-n*i)*m,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,r,i,a,o){let s=Math.cos(i),c=Math.sin(i);return this.set(n*s,n*c,-n*(s*a+c*o)+a+e,-r*c,r*s,-r*(-c*a+s*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(w.makeScale(e,t)),this}rotate(e){return this.premultiply(w.makeRotation(-e)),this}translate(e,t){return this.premultiply(w.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<9;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}};let w=/*@__PURE__*/ new C;function T(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function E(e){return document.createElementNS(`http://www.w3.org/1999/xhtml`,e)}let D={enabled:!0,workingColorSpace:d,spaces:{},convert:function(e,t,n){return this.enabled===!1||t===n||!t||!n||(this.spaces[t].transfer===`srgb`&&(e.r=O(e.r),e.g=O(e.g),e.b=O(e.b)),this.spaces[t].primaries!==this.spaces[n].primaries&&(e.applyMatrix3(this.spaces[t].toXYZ),e.applyMatrix3(this.spaces[n].fromXYZ)),this.spaces[n].transfer===`srgb`&&(e.r=k(e.r),e.g=k(e.g),e.b=k(e.b))),e},fromWorkingColorSpace:function(e,t){return this.convert(e,this.workingColorSpace,t)},toWorkingColorSpace:function(e,t){return this.convert(e,t,this.workingColorSpace)},getPrimaries:function(e){return this.spaces[e].primaries},getTransfer:function(e){return e===``?f:this.spaces[e].transfer},getLuminanceCoefficients:function(e,t=this.workingColorSpace){return e.fromArray(this.spaces[t].luminanceCoefficients)},define:function(e){Object.assign(this.spaces,e)},_getMatrix:function(e,t,n){return e.copy(this.spaces[t].toXYZ).multiply(this.spaces[n].fromXYZ)},_getDrawingBufferColorSpace:function(e){return this.spaces[e].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(e=this.workingColorSpace){return this.spaces[e].workingColorSpaceConfig.unpackColorSpace}};function O(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}function k(e){return e<.0031308?e*12.92:1.055*e**.41666-.055}let ee=[.64,.33,.3,.6,.15,.06],A=[.2126,.7152,.0722],te=[.3127,.329],j=/*@__PURE__*/ new C().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),ne=/*@__PURE__*/ new C().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);D.define({[d]:{primaries:ee,whitePoint:te,transfer:f,toXYZ:j,fromXYZ:ne,luminanceCoefficients:A,workingColorSpaceConfig:{unpackColorSpace:u},outputColorSpaceConfig:{drawingBufferColorSpace:u}},[u]:{primaries:ee,whitePoint:te,transfer:`srgb`,toXYZ:j,fromXYZ:ne,luminanceCoefficients:A,outputColorSpaceConfig:{drawingBufferColorSpace:u}}});let M;var re=class{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>`u`)return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{M===void 0&&(M=E(`canvas`)),M.width=e.width,M.height=e.height;let n=M.getContext(`2d`);e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),t=M}return t.width>2048||t.height>2048?(console.warn(`THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons`,e),t.toDataURL(`image/jpeg`,.6)):t.toDataURL(`image/png`)}static sRGBToLinear(e){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap){let t=E(`canvas`);t.width=e.width,t.height=e.height;let n=t.getContext(`2d`);n.drawImage(e,0,0,e.width,e.height);let r=n.getImageData(0,0,e.width,e.height),i=r.data;for(let e=0;e<i.length;e++)i[e]=O(i[e]/255)*255;return n.putImageData(r,0,0),t}if(e.data){let t=e.data.slice(0);for(let e=0;e<t.length;e++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[e]=Math.floor(O(t[e]/255)*255):t[e]=O(t[e]);return{data:t,width:e.width,height:e.height}}return console.warn(`THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.`),e}};let ie=0;var ae=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:ie++}),this.uuid=g(),this.data=e,this.dataReady=!0,this.version=0}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:``},r=this.data;if(r!==null){let e;if(Array.isArray(r)){e=[];for(let t=0,n=r.length;t<n;t++)r[t].isDataTexture?e.push(oe(r[t].image)):e.push(oe(r[t]))}else e=oe(r);n.url=e}return t||(e.images[this.uuid]=n),n}};function oe(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap?re.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(console.warn(`THREE.Texture: Unable to serialize Texture.`),{})}let N=0;var se=class e extends m{constructor(t=e.DEFAULT_IMAGE,r=e.DEFAULT_MAPPING,i=n,a=n,o=1006,s=1008,c=1023,l=1009,u=e.DEFAULT_ANISOTROPY,d=``){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:N++}),this.uuid=g(),this.name=``,this.source=new ae(t),this.mipmaps=[],this.mapping=r,this.channel=0,this.wrapS=i,this.wrapT=a,this.magFilter=o,this.minFilter=s,this.anisotropy=u,this.format=c,this.internalFormat=null,this.type=l,this.offset=new S(0,0),this.repeat=new S(1,1),this.center=new S(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new C,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=d,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.6,type:`Texture`,generator:`Texture.toJSON`},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:`dispose`})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case t:e.x-=Math.floor(e.x);break;case n:e.x=e.x<0?0:1;break;case r:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x-=Math.floor(e.x)}if(e.y<0||e.y>1)switch(this.wrapT){case t:e.y-=Math.floor(e.y);break;case n:e.y=e.y<0?0:1;break;case r:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y-=Math.floor(e.y)}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};se.DEFAULT_IMAGE=null,se.DEFAULT_MAPPING=300,se.DEFAULT_ANISOTROPY=1;var ce=class e{constructor(t=0,n=0,r=0,i=1){e.prototype.isVector4=!0,this.x=t,this.y=n,this.z=r,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,r){return this.x=e,this.y=t,this.z=n,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w===void 0?1:e.w,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*r+a[12]*i,this.y=a[1]*t+a[5]*n+a[9]*r+a[13]*i,this.z=a[2]*t+a[6]*n+a[10]*r+a[14]*i,this.w=a[3]*t+a[7]*n+a[11]*r+a[15]*i,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,r,i,a=.01,o=.1,s=e.elements,c=s[0],l=s[4],u=s[8],d=s[1],f=s[5],p=s[9],m=s[2],h=s[6],g=s[10];if(Math.abs(l-d)<a&&Math.abs(u-m)<a&&Math.abs(p-h)<a){if(Math.abs(l+d)<o&&Math.abs(u+m)<o&&Math.abs(p+h)<o&&Math.abs(c+f+g-3)<o)return this.set(1,0,0,0),this;t=Math.PI;let e=(c+1)/2,s=(f+1)/2,_=(g+1)/2,v=(l+d)/4,y=(u+m)/4,b=(p+h)/4;return e>s&&e>_?e<a?(n=0,r=.707106781,i=.707106781):(n=Math.sqrt(e),r=v/n,i=y/n):s>_?s<a?(n=.707106781,r=0,i=.707106781):(r=Math.sqrt(s),n=v/r,i=b/r):_<a?(n=.707106781,r=.707106781,i=0):(i=Math.sqrt(_),n=y/i,r=b/i),this.set(n,r,i,t),this}let _=Math.sqrt((h-p)*(h-p)+(u-m)*(u-m)+(d-l)*(d-l));return Math.abs(_)<.001&&(_=1),this.x=(h-p)/_,this.y=(u-m)/_,this.z=(d-l)/_,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this.w=Math.max(e.w,Math.min(t.w,this.w)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this.w=Math.max(e,Math.min(t,this.w)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},le=class{constructor(e=0,t=0,n=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=r}static slerpFlat(e,t,n,r,i,a,o){let s=n[r+0],c=n[r+1],l=n[r+2],u=n[r+3],d=i[a+0],f=i[a+1],p=i[a+2],m=i[a+3];if(o===0)e[t+0]=s,e[t+1]=c,e[t+2]=l,e[t+3]=u;else if(o===1)e[t+0]=d,e[t+1]=f,e[t+2]=p,e[t+3]=m;else{if(u!==m||s!==d||c!==f||l!==p){let e=1-o,t=s*d+c*f+l*p+u*m,n=t>=0?1:-1,r=1-t*t;if(r>2**-52){let i=Math.sqrt(r),a=Math.atan2(i,t*n);e=Math.sin(e*a)/i,o=Math.sin(o*a)/i}let i=o*n;if(s=s*e+d*i,c=c*e+f*i,l=l*e+p*i,u=u*e+m*i,e===1-o){let e=1/Math.sqrt(s*s+c*c+l*l+u*u);s*=e,c*=e,l*=e,u*=e}}e[t]=s,e[t+1]=c,e[t+2]=l,e[t+3]=u}}static multiplyQuaternionsFlat(e,t,n,r,i,a){let o=n[r],s=n[r+1],c=n[r+2],l=n[r+3],u=i[a],d=i[a+1],f=i[a+2],p=i[a+3];return e[t]=o*p+l*u+s*f-c*d,e[t+1]=s*p+l*d+c*u-o*f,e[t+2]=c*p+l*f+o*d-s*u,e[t+3]=l*p-o*u-s*d-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,r){return this._x=e,this._y=t,this._z=n,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,r=e._y,i=e._z,a=e._order,o=Math.cos,s=Math.sin,c=o(n/2),l=o(r/2),u=o(i/2),d=s(n/2),f=s(r/2),p=s(i/2);switch(a){case`XYZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`YXZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`ZXY`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`ZYX`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`YZX`:this._x=d*l*u+c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u-d*f*p;break;case`XZY`:this._x=d*l*u-c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u+d*f*p;break;default:console.warn(`THREE.Quaternion: .setFromEuler() encountered an unknown order: `+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,r=Math.sin(n);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],r=t[4],i=t[8],a=t[1],o=t[5],s=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let e=.5/Math.sqrt(d+1);this._w=.25/e,this._x=(l-s)*e,this._y=(i-c)*e,this._z=(a-r)*e}else if(n>o&&n>u){let e=2*Math.sqrt(1+n-o-u);this._w=(l-s)/e,this._x=.25*e,this._y=(r+a)/e,this._z=(i+c)/e}else if(o>u){let e=2*Math.sqrt(1+o-n-u);this._w=(i-c)/e,this._x=(r+a)/e,this._y=.25*e,this._z=(s+l)/e}else{let e=2*Math.sqrt(1+u-n-o);this._w=(a-r)/e,this._x=(i+c)/e,this._y=(s+l)/e,this._z=.25*e}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<2**-52?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(_(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let r=Math.min(1,t/n);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x*=e,this._y*=e,this._z*=e,this._w*=e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=t._x,s=t._y,c=t._z,l=t._w;return this._x=n*l+a*o+r*c-i*s,this._y=r*l+a*s+i*o-n*c,this._z=i*l+a*c+n*s-r*o,this._w=a*l-n*o-r*s-i*c,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let n=this._x,r=this._y,i=this._z,a=this._w,o=a*e._w+n*e._x+r*e._y+i*e._z;if(o<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,o=-o):this.copy(e),o>=1)return this._w=a,this._x=n,this._y=r,this._z=i,this;let s=1-o*o;if(s<=2**-52){let e=1-t;return this._w=e*a+t*this._w,this._x=e*n+t*this._x,this._y=e*r+t*this._y,this._z=e*i+t*this._z,this.normalize(),this}let c=Math.sqrt(s),l=Math.atan2(c,o),u=Math.sin((1-t)*l)/c,d=Math.sin(t*l)/c;return this._w=a*u+this._w*d,this._x=n*u+this._x*d,this._y=r*u+this._y*d,this._z=i*u+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),r=Math.sqrt(1-n),i=Math.sqrt(n);return this.set(r*Math.sin(e),r*Math.cos(e),i*Math.sin(t),i*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},P=class e{constructor(t=0,n=0,r=0){e.prototype.isVector3=!0,this.x=t,this.y=n,this.z=r}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(de.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(de.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6]*r,this.y=i[1]*t+i[4]*n+i[7]*r,this.z=i[2]*t+i[5]*n+i[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=e.elements,a=1/(i[3]*t+i[7]*n+i[11]*r+i[15]);return this.x=(i[0]*t+i[4]*n+i[8]*r+i[12])*a,this.y=(i[1]*t+i[5]*n+i[9]*r+i[13])*a,this.z=(i[2]*t+i[6]*n+i[10]*r+i[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,r=this.z,i=e.x,a=e.y,o=e.z,s=e.w,c=2*(a*r-o*n),l=2*(o*t-i*r),u=2*(i*n-a*t);return this.x=t+s*c+a*u-o*l,this.y=n+s*l+o*c-i*u,this.z=r+s*u+i*l-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[4]*n+i[8]*r,this.y=i[1]*t+i[5]*n+i[9]*r,this.z=i[2]*t+i[6]*n+i[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,r=e.y,i=e.z,a=t.x,o=t.y,s=t.z;return this.x=r*s-i*o,this.y=i*a-n*s,this.z=n*o-r*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return ue.copy(this).projectOnVector(e),this.sub(ue)}reflect(e){return this.sub(ue.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(_(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,r=this.z-e.z;return t*t+n*n+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let r=Math.sin(t)*e;return this.x=r*Math.sin(n),this.y=Math.cos(t)*e,this.z=r*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};let ue=/*@__PURE__*/ new P,de=/*@__PURE__*/ new le;var F=class{constructor(e=new P(1/0,1/0,1/0),t=new P(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(pe.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(pe.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=pe.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute(`position`);if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let t=0,n=r.count;t<n;t++)e.isMesh===!0?e.getVertexPosition(t,pe):pe.fromBufferAttribute(r,t),pe.applyMatrix4(e.matrixWorld),this.expandByPoint(pe);else e.boundingBox===void 0?(n.boundingBox===null&&n.computeBoundingBox(),me.copy(n.boundingBox)):(e.boundingBox===null&&e.computeBoundingBox(),me.copy(e.boundingBox)),me.applyMatrix4(e.matrixWorld),this.union(me)}let r=e.children;for(let e=0,n=r.length;e<n;e++)this.expandByObject(r[e],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,pe),pe.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(be),xe.subVectors(this.max,be),he.subVectors(e.a,be),ge.subVectors(e.b,be),_e.subVectors(e.c,be),I.subVectors(ge,he),ve.subVectors(_e,ge),ye.subVectors(he,_e);let t=[0,-I.z,I.y,0,-ve.z,ve.y,0,-ye.z,ye.y,I.z,0,-I.x,ve.z,0,-ve.x,ye.z,0,-ye.x,-I.y,I.x,0,-ve.y,ve.x,0,-ye.y,ye.x,0];return!we(t,he,ge,_e,xe)||(t=[1,0,0,0,1,0,0,0,1],!we(t,he,ge,_e,xe))?!1:(Se.crossVectors(I,ve),t=[Se.x,Se.y,Se.z],we(t,he,ge,_e,xe))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,pe).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(pe).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()||(fe[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),fe[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),fe[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),fe[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),fe[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),fe[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),fe[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),fe[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(fe)),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}};let fe=[/*@__PURE__*/ new P,/*@__PURE__*/ new P,/*@__PURE__*/ new P,/*@__PURE__*/ new P,/*@__PURE__*/ new P,/*@__PURE__*/ new P,/*@__PURE__*/ new P,/*@__PURE__*/ new P],pe=/*@__PURE__*/ new P,me=/*@__PURE__*/ new F,he=/*@__PURE__*/ new P,ge=/*@__PURE__*/ new P,_e=/*@__PURE__*/ new P,I=/*@__PURE__*/ new P,ve=/*@__PURE__*/ new P,ye=/*@__PURE__*/ new P,be=/*@__PURE__*/ new P,xe=/*@__PURE__*/ new P,Se=/*@__PURE__*/ new P,Ce=/*@__PURE__*/ new P;function we(e,t,n,r,i){for(let a=0,o=e.length-3;a<=o;a+=3){Ce.fromArray(e,a);let o=i.x*Math.abs(Ce.x)+i.y*Math.abs(Ce.y)+i.z*Math.abs(Ce.z),s=t.dot(Ce),c=n.dot(Ce),l=r.dot(Ce);if(Math.max(-Math.max(s,c,l),Math.min(s,c,l))>o)return!1}return!0}let Te=/*@__PURE__*/ new F,Ee=/*@__PURE__*/ new P,De=/*@__PURE__*/ new P;var Oe=class{constructor(e=new P,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t===void 0?Te.setFromPoints(e).getCenter(n):n.copy(t);let r=0;for(let t=0,i=e.length;t<i;t++)r=Math.max(r,n.distanceToSquared(e[t]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius*=e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Ee.subVectors(e,this.center);let t=Ee.lengthSq();if(t>this.radius*this.radius){let e=Math.sqrt(t),n=(e-this.radius)*.5;this.center.addScaledVector(Ee,n/e),this.radius+=n}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(De.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Ee.copy(e.center).add(De)),this.expandByPoint(Ee.copy(e.center).sub(De))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}};let ke=/*@__PURE__*/ new P,Ae=/*@__PURE__*/ new P,je=/*@__PURE__*/ new P,Me=/*@__PURE__*/ new P,Ne=/*@__PURE__*/ new P,Pe=/*@__PURE__*/ new P,Fe=/*@__PURE__*/ new P;var Ie=class{constructor(e=new P,t=new P(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,ke)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=ke.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(ke.copy(this.origin).addScaledVector(this.direction,t),ke.distanceToSquared(e))}distanceSqToSegment(e,t,n,r){Ae.copy(e).add(t).multiplyScalar(.5),je.copy(t).sub(e).normalize(),Me.copy(this.origin).sub(Ae);let i=e.distanceTo(t)*.5,a=-this.direction.dot(je),o=Me.dot(this.direction),s=-Me.dot(je),c=Me.lengthSq(),l=Math.abs(1-a*a),u,d,f,p;if(l>0){if(u=a*s-o,d=a*o-s,p=i*l,u>=0){if(d>=-p){if(d<=p){let e=1/l;u*=e,d*=e,f=u*(u+a*d+2*o)+d*(a*u+d+2*s)+c}else d=i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d=-i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d<=-p?(u=Math.max(0,-(-a*i+o)),d=u>0?-i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c):d<=p?(u=0,d=Math.min(Math.max(-i,-s),i),f=d*(d+2*s)+c):(u=Math.max(0,-(a*i+o)),d=u>0?i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c)}else d=a>0?-i:i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(Ae).addScaledVector(je,d),f}intersectSphere(e,t){ke.subVectors(e.center,this.origin);let n=ke.dot(this.direction),r=ke.dot(ke)-n*n,i=e.radius*e.radius;if(r>i)return null;let a=Math.sqrt(i-r),o=n-a,s=n+a;return s<0?null:o<0?this.at(s,t):this.at(o,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,r,i,a,o,s,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,r=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,r=(e.min.x-d.x)*c),l>=0?(i=(e.min.y-d.y)*l,a=(e.max.y-d.y)*l):(i=(e.max.y-d.y)*l,a=(e.min.y-d.y)*l),n>a||i>r||((i>n||isNaN(n))&&(n=i),(a<r||isNaN(r))&&(r=a),u>=0?(o=(e.min.z-d.z)*u,s=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,s=(e.min.z-d.z)*u),n>s||o>r)||((o>n||n!==n)&&(n=o),(s<r||r!==r)&&(r=s),r<0)?null:this.at(n>=0?n:r,t)}intersectsBox(e){return this.intersectBox(e,ke)!==null}intersectTriangle(e,t,n,r,i){Ne.subVectors(t,e),Pe.subVectors(n,e),Fe.crossVectors(Ne,Pe);let a=this.direction.dot(Fe),o;if(a>0){if(r)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Me.subVectors(this.origin,e);let s=o*this.direction.dot(Pe.crossVectors(Me,Pe));if(s<0)return null;let c=o*this.direction.dot(Ne.cross(Me));if(c<0||s+c>a)return null;let l=-o*Me.dot(Fe);return l<0?null:this.at(l/a,i)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Le=class e{constructor(t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g){e.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g)}set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){let g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=r,g[1]=i,g[5]=a,g[9]=o,g[13]=s,g[2]=c,g[6]=l,g[10]=u,g[14]=d,g[3]=f,g[7]=p,g[11]=m,g[15]=h,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new e().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){let t=this.elements,n=e.elements,r=1/Re.setFromMatrixColumn(e,0).length(),i=1/Re.setFromMatrixColumn(e,1).length(),a=1/Re.setFromMatrixColumn(e,2).length();return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=0,t[4]=n[4]*i,t[5]=n[5]*i,t[6]=n[6]*i,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,r=e.y,i=e.z,a=Math.cos(n),o=Math.sin(n),s=Math.cos(r),c=Math.sin(r),l=Math.cos(i),u=Math.sin(i);if(e.order===`XYZ`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=-s*u,t[8]=c,t[1]=n+r*c,t[5]=e-i*c,t[9]=-o*s,t[2]=i-e*c,t[6]=r+n*c,t[10]=a*s}else if(e.order===`YXZ`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e+i*o,t[4]=r*o-n,t[8]=a*c,t[1]=a*u,t[5]=a*l,t[9]=-o,t[2]=n*o-r,t[6]=i+e*o,t[10]=a*s}else if(e.order===`ZXY`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e-i*o,t[4]=-a*u,t[8]=r+n*o,t[1]=n+r*o,t[5]=a*l,t[9]=i-e*o,t[2]=-a*c,t[6]=o,t[10]=a*s}else if(e.order===`ZYX`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=r*c-n,t[8]=e*c+i,t[1]=s*u,t[5]=i*c+e,t[9]=n*c-r,t[2]=-c,t[6]=o*s,t[10]=a*s}else if(e.order===`YZX`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=i-e*u,t[8]=r*u+n,t[1]=u,t[5]=a*l,t[9]=-o*l,t[2]=-c*l,t[6]=n*u+r,t[10]=e-i*u}else if(e.order===`XZY`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=-u,t[8]=c*l,t[1]=e*u+i,t[5]=a*l,t[9]=n*u-r,t[2]=r*u-n,t[6]=o*l,t[10]=i*u+e}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Be,e,Ve)}lookAt(e,t,n){let r=this.elements;return We.subVectors(e,t),We.lengthSq()===0&&(We.z=1),We.normalize(),He.crossVectors(n,We),He.lengthSq()===0&&(Math.abs(n.z)===1?We.x+=1e-4:We.z+=1e-4,We.normalize(),He.crossVectors(n,We)),He.normalize(),Ue.crossVectors(We,He),r[0]=He.x,r[4]=Ue.x,r[8]=We.x,r[1]=He.y,r[5]=Ue.y,r[9]=We.y,r[2]=He.z,r[6]=Ue.z,r[10]=We.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[4],s=n[8],c=n[12],l=n[1],u=n[5],d=n[9],f=n[13],p=n[2],m=n[6],h=n[10],g=n[14],_=n[3],v=n[7],y=n[11],b=n[15],x=r[0],S=r[4],C=r[8],w=r[12],T=r[1],E=r[5],D=r[9],O=r[13],k=r[2],ee=r[6],A=r[10],te=r[14],j=r[3],ne=r[7],M=r[11],re=r[15];return i[0]=a*x+o*T+s*k+c*j,i[4]=a*S+o*E+s*ee+c*ne,i[8]=a*C+o*D+s*A+c*M,i[12]=a*w+o*O+s*te+c*re,i[1]=l*x+u*T+d*k+f*j,i[5]=l*S+u*E+d*ee+f*ne,i[9]=l*C+u*D+d*A+f*M,i[13]=l*w+u*O+d*te+f*re,i[2]=p*x+m*T+h*k+g*j,i[6]=p*S+m*E+h*ee+g*ne,i[10]=p*C+m*D+h*A+g*M,i[14]=p*w+m*O+h*te+g*re,i[3]=_*x+v*T+y*k+b*j,i[7]=_*S+v*E+y*ee+b*ne,i[11]=_*C+v*D+y*A+b*M,i[15]=_*w+v*O+y*te+b*re,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[12],a=e[1],o=e[5],s=e[9],c=e[13],l=e[2],u=e[6],d=e[10],f=e[14],p=e[3],m=e[7],h=e[11],g=e[15];return p*(+i*s*u-r*c*u-i*o*d+n*c*d+r*o*f-n*s*f)+m*(+t*s*f-t*c*d+i*a*d-r*a*f+r*c*l-i*s*l)+h*(+t*c*u-t*o*f-i*a*u+n*a*f+i*o*l-n*c*l)+g*(-r*o*l-t*s*u+t*o*d+r*a*u-n*a*d+n*s*l)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=e[9],d=e[10],f=e[11],p=e[12],m=e[13],h=e[14],g=e[15],_=u*h*c-m*d*c+m*s*f-o*h*f-u*s*g+o*d*g,v=p*d*c-l*h*c-p*s*f+a*h*f+l*s*g-a*d*g,y=l*m*c-p*u*c+p*o*f-a*m*f-l*o*g+a*u*g,b=p*u*s-l*m*s-p*o*d+a*m*d+l*o*h-a*u*h,x=t*_+n*v+r*y+i*b;if(x===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let S=1/x;return e[0]=_*S,e[1]=(m*d*i-u*h*i-m*r*f+n*h*f+u*r*g-n*d*g)*S,e[2]=(o*h*i-m*s*i+m*r*c-n*h*c-o*r*g+n*s*g)*S,e[3]=(u*s*i-o*d*i-u*r*c+n*d*c+o*r*f-n*s*f)*S,e[4]=v*S,e[5]=(l*h*i-p*d*i+p*r*f-t*h*f-l*r*g+t*d*g)*S,e[6]=(p*s*i-a*h*i-p*r*c+t*h*c+a*r*g-t*s*g)*S,e[7]=(a*d*i-l*s*i+l*r*c-t*d*c-a*r*f+t*s*f)*S,e[8]=y*S,e[9]=(p*u*i-l*m*i-p*n*f+t*m*f+l*n*g-t*u*g)*S,e[10]=(a*m*i-p*o*i+p*n*c-t*m*c-a*n*g+t*o*g)*S,e[11]=(l*o*i-a*u*i-l*n*c+t*u*c+a*n*f-t*o*f)*S,e[12]=b*S,e[13]=(l*m*r-p*u*r+p*n*d-t*m*d-l*n*h+t*u*h)*S,e[14]=(p*o*r-a*m*r-p*n*s+t*m*s+a*n*h-t*o*h)*S,e[15]=(a*u*r-l*o*r+l*n*s-t*u*s-a*n*d+t*o*d)*S,this}scale(e){let t=this.elements,n=e.x,r=e.y,i=e.z;return t[0]*=n,t[4]*=r,t[8]*=i,t[1]*=n,t[5]*=r,t[9]*=i,t[2]*=n,t[6]*=r,t[10]*=i,t[3]*=n,t[7]*=r,t[11]*=i,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,r))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),r=Math.sin(t),i=1-n,a=e.x,o=e.y,s=e.z,c=i*a,l=i*o;return this.set(c*a+n,c*o-r*s,c*s+r*o,0,c*o+r*s,l*o+n,l*s-r*a,0,c*s-r*o,l*s+r*a,i*s*s+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,r,i,a){return this.set(1,n,i,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,n){let r=this.elements,i=t._x,a=t._y,o=t._z,s=t._w,c=i+i,l=a+a,u=o+o,d=i*c,f=i*l,p=i*u,m=a*l,h=a*u,g=o*u,_=s*c,v=s*l,y=s*u,b=n.x,x=n.y,S=n.z;return r[0]=(1-(m+g))*b,r[1]=(f+y)*b,r[2]=(p-v)*b,r[3]=0,r[4]=(f-y)*x,r[5]=(1-(d+g))*x,r[6]=(h+_)*x,r[7]=0,r[8]=(p+v)*S,r[9]=(h-_)*S,r[10]=(1-(d+m))*S,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,n){let r=this.elements,i=Re.set(r[0],r[1],r[2]).length(),a=Re.set(r[4],r[5],r[6]).length(),o=Re.set(r[8],r[9],r[10]).length();this.determinant()<0&&(i=-i),e.x=r[12],e.y=r[13],e.z=r[14],ze.copy(this);let s=1/i,c=1/a,l=1/o;return ze.elements[0]*=s,ze.elements[1]*=s,ze.elements[2]*=s,ze.elements[4]*=c,ze.elements[5]*=c,ze.elements[6]*=c,ze.elements[8]*=l,ze.elements[9]*=l,ze.elements[10]*=l,t.setFromRotationMatrix(ze),n.x=i,n.y=a,n.z=o,this}makePerspective(e,t,n,r,i,a,o=p){let s=this.elements,c=2*i/(t-e),l=2*i/(n-r),u=(t+e)/(t-e),d=(n+r)/(n-r),f,m;if(o===2e3)f=-(a+i)/(a-i),m=-2*a*i/(a-i);else if(o===2001)f=-a/(a-i),m=-a*i/(a-i);else throw Error(`THREE.Matrix4.makePerspective(): Invalid coordinate system: `+o);return s[0]=c,s[4]=0,s[8]=u,s[12]=0,s[1]=0,s[5]=l,s[9]=d,s[13]=0,s[2]=0,s[6]=0,s[10]=f,s[14]=m,s[3]=0,s[7]=0,s[11]=-1,s[15]=0,this}makeOrthographic(e,t,n,r,i,a,o=p){let s=this.elements,c=1/(t-e),l=1/(n-r),u=1/(a-i),d=(t+e)*c,f=(n+r)*l,m,h;if(o===2e3)m=(a+i)*u,h=-2*u;else if(o===2001)m=i*u,h=-1*u;else throw Error(`THREE.Matrix4.makeOrthographic(): Invalid coordinate system: `+o);return s[0]=2*c,s[4]=0,s[8]=0,s[12]=-d,s[1]=0,s[5]=2*l,s[9]=0,s[13]=-f,s[2]=0,s[6]=0,s[10]=h,s[14]=-m,s[3]=0,s[7]=0,s[11]=0,s[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<16;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}};let Re=/*@__PURE__*/ new P,ze=/*@__PURE__*/ new Le,Be=/*@__PURE__*/ new P(0,0,0),Ve=/*@__PURE__*/ new P(1,1,1),He=/*@__PURE__*/ new P,Ue=/*@__PURE__*/ new P,We=/*@__PURE__*/ new P,Ge=/*@__PURE__*/ new Le,Ke=/*@__PURE__*/ new le;var qe=class e{constructor(t=0,n=0,r=0,i=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=r,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,r=this._order){return this._x=e,this._y=t,this._z=n,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let r=e.elements,i=r[0],a=r[4],o=r[8],s=r[1],c=r[5],l=r[9],u=r[2],d=r[6],f=r[10];switch(t){case`XYZ`:this._y=Math.asin(_(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-l,f),this._z=Math.atan2(-a,i)):(this._x=Math.atan2(d,c),this._z=0);break;case`YXZ`:this._x=Math.asin(-_(l,-1,1)),Math.abs(l)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(s,c)):(this._y=Math.atan2(-u,i),this._z=0);break;case`ZXY`:this._x=Math.asin(_(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(s,i));break;case`ZYX`:this._y=Math.asin(-_(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(s,i)):(this._x=0,this._z=Math.atan2(-a,c));break;case`YZX`:this._z=Math.asin(_(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,i)):(this._x=0,this._y=Math.atan2(o,f));break;case`XZY`:this._z=Math.asin(-_(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,i)):(this._x=Math.atan2(-l,f),this._y=0);break;default:console.warn(`THREE.Euler: .setFromRotationMatrix() encountered an unknown order: `+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Ge.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Ge,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Ke.setFromEuler(this),this.setFromQuaternion(Ke,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};qe.DEFAULT_ORDER=`XYZ`;var Je=class{constructor(){this.mask=1}set(e){this.mask=1<<e>>>0}enable(e){this.mask|=1<<e}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e}disable(e){this.mask&=~(1<<e)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return!!(this.mask&1<<e)}};let Ye=0,Xe=/*@__PURE__*/ new P,Ze=/*@__PURE__*/ new le,Qe=/*@__PURE__*/ new Le,$e=/*@__PURE__*/ new P,et=/*@__PURE__*/ new P,tt=/*@__PURE__*/ new P,nt=/*@__PURE__*/ new le,rt=/*@__PURE__*/ new P(1,0,0),it=/*@__PURE__*/ new P(0,1,0),at=/*@__PURE__*/ new P(0,0,1),ot={type:`added`},st={type:`removed`},ct={type:`childadded`,child:null},lt={type:`childremoved`,child:null};var ut=class e extends m{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Ye++}),this.uuid=g(),this.name=``,this.type=`Object3D`,this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new P,n=new qe,r=new le,i=new P(1,1,1);function a(){r.setFromEuler(n,!1)}function o(){n.setFromQuaternion(r,void 0,!1)}n._onChange(a),r._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Le},normalMatrix:{value:new C}}),this.matrix=new Le,this.matrixWorld=new Le,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Je,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Ze.setFromAxisAngle(e,t),this.quaternion.multiply(Ze),this}rotateOnWorldAxis(e,t){return Ze.setFromAxisAngle(e,t),this.quaternion.premultiply(Ze),this}rotateX(e){return this.rotateOnAxis(rt,e)}rotateY(e){return this.rotateOnAxis(it,e)}rotateZ(e){return this.rotateOnAxis(at,e)}translateOnAxis(e,t){return Xe.copy(e).applyQuaternion(this.quaternion),this.position.add(Xe.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(rt,e)}translateY(e){return this.translateOnAxis(it,e)}translateZ(e){return this.translateOnAxis(at,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Qe.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?$e.copy(e):$e.set(e,t,n);let r=this.parent;this.updateWorldMatrix(!0,!1),et.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Qe.lookAt(et,$e,this.up):Qe.lookAt($e,et,this.up),this.quaternion.setFromRotationMatrix(Qe),r&&(Qe.extractRotation(r.matrixWorld),Ze.setFromRotationMatrix(Qe),this.quaternion.premultiply(Ze.invert()))}add(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return e===this?(console.error(`THREE.Object3D.add: object can't be added as a child of itself.`,e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(ot),ct.child=e,this.dispatchEvent(ct),ct.child=null):console.error(`THREE.Object3D.add: object not an instance of THREE.Object3D.`,e),this)}remove(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.remove(arguments[e]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(st),lt.child=e,this.dispatchEvent(lt),lt.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Qe.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Qe.multiply(e.parent.matrixWorld)),e.applyMatrix4(Qe),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(ot),ct.child=e,this.dispatchEvent(ct),ct.child=null,this}getObjectById(e){return this.getObjectByProperty(`id`,e)}getObjectByName(e){return this.getObjectByProperty(`name`,e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,r=this.children.length;n<r;n++){let r=this.children[n].getObjectByProperty(e,t);if(r!==void 0)return r}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let r=this.children;for(let i=0,a=r.length;i<a;i++)r[i].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(et,e,tt),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(et,nt,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){let e=this.children;for(let t=0,n=e.length;t<n;t++)e[t].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e==`string`,n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:`Object`,generator:`Object3D.toJSON`});let r={};r.uuid=this.uuid,r.type=this.type,this.name!==``&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.isInstancedMesh&&(r.type=`InstancedMesh`,r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type=`BatchedMesh`,r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.visibility=this._visibility,r.active=this._active,r.bounds=this._bounds.map(e=>({boxInitialized:e.boxInitialized,boxMin:e.box.min.toArray(),boxMax:e.box.max.toArray(),sphereInitialized:e.sphereInitialized,sphereRadius:e.sphere.radius,sphereCenter:e.sphere.center.toArray()})),r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.geometryCount=this._geometryCount,r.matricesTexture=this._matricesTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere={center:r.boundingSphere.center.toArray(),radius:r.boundingSphere.radius}),this.boundingBox!==null&&(r.boundingBox={min:r.boundingBox.min.toArray(),max:r.boundingBox.max.toArray()}));function i(t,n){return t[n.uuid]===void 0&&(t[n.uuid]=n.toJSON(e)),n.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=i(e.geometries,this.geometry);let t=this.geometry.parameters;if(t!==void 0&&t.shapes!==void 0){let n=t.shapes;if(Array.isArray(n))for(let t=0,r=n.length;t<r;t++){let r=n[t];i(e.shapes,r)}else i(e.shapes,n)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(i(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0){if(Array.isArray(this.material)){let t=[];for(let n=0,r=this.material.length;n<r;n++)t.push(i(e.materials,this.material[n]));r.material=t}else r.material=i(e.materials,this.material)}if(this.children.length>0){r.children=[];for(let t=0;t<this.children.length;t++)r.children.push(this.children[t].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let t=0;t<this.animations.length;t++){let n=this.animations[t];r.animations.push(i(e.animations,n))}}if(t){let t=a(e.geometries),r=a(e.materials),i=a(e.textures),o=a(e.images),s=a(e.shapes),c=a(e.skeletons),l=a(e.animations),u=a(e.nodes);t.length>0&&(n.geometries=t),r.length>0&&(n.materials=r),i.length>0&&(n.textures=i),o.length>0&&(n.images=o),s.length>0&&(n.shapes=s),c.length>0&&(n.skeletons=c),l.length>0&&(n.animations=l),u.length>0&&(n.nodes=u)}return n.object=r,n;function a(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let t=0;t<e.children.length;t++){let n=e.children[t];this.add(n.clone())}return this}};ut.DEFAULT_UP=/*@__PURE__*/ new P(0,1,0),ut.DEFAULT_MATRIX_AUTO_UPDATE=!0,ut.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;let dt=/*@__PURE__*/ new P,ft=/*@__PURE__*/ new P,pt=/*@__PURE__*/ new P,mt=/*@__PURE__*/ new P,ht=/*@__PURE__*/ new P,gt=/*@__PURE__*/ new P,_t=/*@__PURE__*/ new P,vt=/*@__PURE__*/ new P,yt=/*@__PURE__*/ new P,bt=/*@__PURE__*/ new P,xt=/*@__PURE__*/ new ce,St=/*@__PURE__*/ new ce,Ct=/*@__PURE__*/ new ce;var wt=class e{constructor(e=new P,t=new P,n=new P){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,r){r.subVectors(n,t),dt.subVectors(e,t),r.cross(dt);let i=r.lengthSq();return i>0?r.multiplyScalar(1/Math.sqrt(i)):r.set(0,0,0)}static getBarycoord(e,t,n,r,i){dt.subVectors(r,t),ft.subVectors(n,t),pt.subVectors(e,t);let a=dt.dot(dt),o=dt.dot(ft),s=dt.dot(pt),c=ft.dot(ft),l=ft.dot(pt),u=a*c-o*o;if(u===0)return i.set(0,0,0),null;let d=1/u,f=(c*s-o*l)*d,p=(a*l-o*s)*d;return i.set(1-f-p,p,f)}static containsPoint(e,t,n,r){return this.getBarycoord(e,t,n,r,mt)!==null&&mt.x>=0&&mt.y>=0&&mt.x+mt.y<=1}static getInterpolation(e,t,n,r,i,a,o,s){return this.getBarycoord(e,t,n,r,mt)===null?(s.x=0,s.y=0,`z`in s&&(s.z=0),`w`in s&&(s.w=0),null):(s.setScalar(0),s.addScaledVector(i,mt.x),s.addScaledVector(a,mt.y),s.addScaledVector(o,mt.z),s)}static getInterpolatedAttribute(e,t,n,r,i,a){return xt.setScalar(0),St.setScalar(0),Ct.setScalar(0),xt.fromBufferAttribute(e,t),St.fromBufferAttribute(e,n),Ct.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector(xt,i.x),a.addScaledVector(St,i.y),a.addScaledVector(Ct,i.z),a}static isFrontFacing(e,t,n,r){return dt.subVectors(n,t),ft.subVectors(e,t),dt.cross(ft).dot(r)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,r){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,n,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return dt.subVectors(this.c,this.b),ft.subVectors(this.a,this.b),dt.cross(ft).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,r,i,a){return e.getInterpolation(t,this.a,this.b,this.c,n,r,i,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,r=this.b,i=this.c,a,o;ht.subVectors(r,n),gt.subVectors(i,n),vt.subVectors(e,n);let s=ht.dot(vt),c=gt.dot(vt);if(s<=0&&c<=0)return t.copy(n);yt.subVectors(e,r);let l=ht.dot(yt),u=gt.dot(yt);if(l>=0&&u<=l)return t.copy(r);let d=s*u-l*c;if(d<=0&&s>=0&&l<=0)return a=s/(s-l),t.copy(n).addScaledVector(ht,a);bt.subVectors(e,i);let f=ht.dot(bt),p=gt.dot(bt);if(p>=0&&f<=p)return t.copy(i);let m=f*c-s*p;if(m<=0&&c>=0&&p<=0)return o=c/(c-p),t.copy(n).addScaledVector(gt,o);let h=l*p-f*u;if(h<=0&&u-l>=0&&f-p>=0)return _t.subVectors(i,r),o=(u-l)/(u-l+(f-p)),t.copy(r).addScaledVector(_t,o);let g=1/(h+m+d);return a=m*g,o=d*g,t.copy(n).addScaledVector(ht,a).addScaledVector(gt,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}};let Tt={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},L={h:0,s:0,l:0},Et={h:0,s:0,l:0};function Dt(e,t,n){return n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}var Ot=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let t=e;t&&t.isColor?this.copy(t):typeof t==`number`?this.setHex(t):typeof t==`string`&&this.setStyle(t)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=u){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,D.toWorkingColorSpace(this,t),this}setRGB(e,t,n,r=D.workingColorSpace){return this.r=e,this.g=t,this.b=n,D.toWorkingColorSpace(this,r),this}setHSL(e,t,n,r=D.workingColorSpace){if(e=v(e,1),t=_(t,0,1),n=_(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,i=2*n-r;this.r=Dt(i,r,e+1/3),this.g=Dt(i,r,e),this.b=Dt(i,r,e-1/3)}return D.toWorkingColorSpace(this,r),this}setStyle(e,t=u){function n(t){t!==void 0&&parseFloat(t)<1&&console.warn(`THREE.Color: Alpha component of `+e+` will be ignored.`)}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let i,a=r[1],o=r[2];switch(a){case`rgb`:case`rgba`:if(i=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(255,parseInt(i[1],10))/255,Math.min(255,parseInt(i[2],10))/255,Math.min(255,parseInt(i[3],10))/255,t);if(i=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(100,parseInt(i[1],10))/100,Math.min(100,parseInt(i[2],10))/100,Math.min(100,parseInt(i[3],10))/100,t);break;case`hsl`:case`hsla`:if(i=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setHSL(parseFloat(i[1])/360,parseFloat(i[2])/100,parseFloat(i[3])/100,t);break;default:console.warn(`THREE.Color: Unknown color model `+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let n=r[1],i=n.length;if(i===3)return this.setRGB(parseInt(n.charAt(0),16)/15,parseInt(n.charAt(1),16)/15,parseInt(n.charAt(2),16)/15,t);if(i===6)return this.setHex(parseInt(n,16),t);console.warn(`THREE.Color: Invalid hex color `+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=u){let n=Tt[e.toLowerCase()];return n===void 0?console.warn(`THREE.Color: Unknown color `+e):this.setHex(n,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=O(e.r),this.g=O(e.g),this.b=O(e.b),this}copyLinearToSRGB(e){return this.r=k(e.r),this.g=k(e.g),this.b=k(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=u){return D.fromWorkingColorSpace(R.copy(this),e),Math.round(_(R.r*255,0,255))*65536+Math.round(_(R.g*255,0,255))*256+Math.round(_(R.b*255,0,255))}getHexString(e=u){return(`000000`+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=D.workingColorSpace){D.fromWorkingColorSpace(R.copy(this),t);let n=R.r,r=R.g,i=R.b,a=Math.max(n,r,i),o=Math.min(n,r,i),s,c,l=(o+a)/2;if(o===a)s=0,c=0;else{let e=a-o;switch(c=l<=.5?e/(a+o):e/(2-a-o),a){case n:s=(r-i)/e+(r<i?6:0);break;case r:s=(i-n)/e+2;break;case i:s=(n-r)/e+4}s/=6}return e.h=s,e.s=c,e.l=l,e}getRGB(e,t=D.workingColorSpace){return D.fromWorkingColorSpace(R.copy(this),t),e.r=R.r,e.g=R.g,e.b=R.b,e}getStyle(e=u){D.fromWorkingColorSpace(R.copy(this),e);let t=R.r,n=R.g,r=R.b;return e===`srgb`?`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(r*255)})`:`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${r.toFixed(3)})`}offsetHSL(e,t,n){return this.getHSL(L),this.setHSL(L.h+e,L.s+t,L.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(L),e.getHSL(Et);let n=y(L.h,Et.h,t),r=y(L.s,Et.s,t),i=y(L.l,Et.l,t);return this.setHSL(n,r,i),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,r=this.b,i=e.elements;return this.r=i[0]*t+i[3]*n+i[6]*r,this.g=i[1]*t+i[4]*n+i[7]*r,this.b=i[2]*t+i[5]*n+i[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}};let R=/*@__PURE__*/ new Ot;Ot.NAMES=Tt;let z=/*@__PURE__*/ new P,kt=/*@__PURE__*/ new S;var At=class{constructor(e,t,n=!1){if(Array.isArray(e))throw TypeError(`THREE.BufferAttribute: array should be a Typed Array.`);this.isBufferAttribute=!0,this.name=``,this.array=e,this.itemSize=t,this.count=e===void 0?0:e.length/t,this.normalized=n,this.usage=35044,this.updateRanges=[],this.gpuType=1015,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let r=0,i=this.itemSize;r<i;r++)this.array[e+r]=t.array[n+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)kt.fromBufferAttribute(this,t),kt.applyMatrix3(e),this.setXY(t,kt.x,kt.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)z.fromBufferAttribute(this,t),z.applyMatrix3(e),this.setXYZ(t,z.x,z.y,z.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)z.fromBufferAttribute(this,t),z.applyMatrix4(e),this.setXYZ(t,z.x,z.y,z.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)z.fromBufferAttribute(this,t),z.applyNormalMatrix(e),this.setXYZ(t,z.x,z.y,z.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)z.fromBufferAttribute(this,t),z.transformDirection(e),this.setXYZ(t,z.x,z.y,z.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=b(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=x(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=b(t,this.array)),t}setX(e,t){return this.normalized&&(t=x(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=b(t,this.array)),t}setY(e,t){return this.normalized&&(t=x(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=b(t,this.array)),t}setZ(e,t){return this.normalized&&(t=x(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=b(t,this.array)),t}setW(e,t){return this.normalized&&(t=x(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=x(t,this.array),n=x(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,r){return e*=this.itemSize,this.normalized&&(t=x(t,this.array),n=x(n,this.array),r=x(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e*=this.itemSize,this.normalized&&(t=x(t,this.array),n=x(n,this.array),r=x(r,this.array),i=x(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this.array[e+3]=i,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==``&&(e.name=this.name),this.usage!==35044&&(e.usage=this.usage),e}},jt=class extends At{constructor(e,t,n){super(new Uint16Array(e),t,n)}},Mt=class extends At{constructor(e,t,n){super(new Uint32Array(e),t,n)}},Nt=class extends At{constructor(e,t,n){super(new Float32Array(e),t,n)}};let Pt=0,Ft=/*@__PURE__*/ new Le,It=/*@__PURE__*/ new ut,Lt=/*@__PURE__*/ new P,Rt=/*@__PURE__*/ new F,zt=/*@__PURE__*/ new F,B=/*@__PURE__*/ new P;var Bt=class e extends m{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Pt++}),this.uuid=g(),this.name=``,this.type=`BufferGeometry`,this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return this.index=Array.isArray(e)?new(T(e)?Mt:jt)(e,1):e,this}setIndirect(e){return this.indirect=e,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let t=new C().getNormalMatrix(e);n.applyNormalMatrix(t),n.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return Ft.makeRotationFromQuaternion(e),this.applyMatrix4(Ft),this}rotateX(e){return Ft.makeRotationX(e),this.applyMatrix4(Ft),this}rotateY(e){return Ft.makeRotationY(e),this.applyMatrix4(Ft),this}rotateZ(e){return Ft.makeRotationZ(e),this.applyMatrix4(Ft),this}translate(e,t,n){return Ft.makeTranslation(e,t,n),this.applyMatrix4(Ft),this}scale(e,t,n){return Ft.makeScale(e,t,n),this.applyMatrix4(Ft),this}lookAt(e){return It.lookAt(e),It.updateMatrix(),this.applyMatrix4(It.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Lt).negate(),this.translate(Lt.x,Lt.y,Lt.z),this}setFromPoints(e){let t=this.getAttribute(`position`);if(t===void 0){let t=[];for(let n=0,r=e.length;n<r;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}this.setAttribute(`position`,new Nt(t,3))}else{for(let n=0,r=t.count;n<r;n++){let r=e[n];t.setXYZ(n,r.x,r.y,r.z||0)}e.length>t.count&&console.warn(`THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.`),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new F);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)console.error(`THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.`,this),this.boundingBox.set(new P(-1/0,-1/0,-1/0),new P(1/0,1/0,1/0));else{if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Rt.setFromBufferAttribute(n),this.morphTargetsRelative?(B.addVectors(this.boundingBox.min,Rt.min),this.boundingBox.expandByPoint(B),B.addVectors(this.boundingBox.max,Rt.max),this.boundingBox.expandByPoint(B)):(this.boundingBox.expandByPoint(Rt.min),this.boundingBox.expandByPoint(Rt.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error(`THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.`,this)}}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Oe);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)console.error(`THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.`,this),this.boundingSphere.set(new P,1/0);else if(e){let n=this.boundingSphere.center;if(Rt.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];zt.setFromBufferAttribute(n),this.morphTargetsRelative?(B.addVectors(Rt.min,zt.min),Rt.expandByPoint(B),B.addVectors(Rt.max,zt.max),Rt.expandByPoint(B)):(Rt.expandByPoint(zt.min),Rt.expandByPoint(zt.max))}Rt.getCenter(n);let r=0;for(let t=0,i=e.count;t<i;t++)B.fromBufferAttribute(e,t),r=Math.max(r,n.distanceToSquared(B));if(t)for(let i=0,a=t.length;i<a;i++){let a=t[i],o=this.morphTargetsRelative;for(let t=0,i=a.count;t<i;t++)B.fromBufferAttribute(a,t),o&&(Lt.fromBufferAttribute(e,t),B.add(Lt)),r=Math.max(r,n.distanceToSquared(B))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.`,this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error(`THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)`);return}let n=t.position,r=t.normal,i=t.uv;this.hasAttribute(`tangent`)===!1&&this.setAttribute(`tangent`,new At(new Float32Array(4*n.count),4));let a=this.getAttribute(`tangent`),o=[],s=[];for(let e=0;e<n.count;e++)o[e]=new P,s[e]=new P;let c=new P,l=new P,u=new P,d=new S,f=new S,p=new S,m=new P,h=new P;function g(e,t,r){c.fromBufferAttribute(n,e),l.fromBufferAttribute(n,t),u.fromBufferAttribute(n,r),d.fromBufferAttribute(i,e),f.fromBufferAttribute(i,t),p.fromBufferAttribute(i,r),l.sub(c),u.sub(c),f.sub(d),p.sub(d);let a=1/(f.x*p.y-p.x*f.y);isFinite(a)&&(m.copy(l).multiplyScalar(p.y).addScaledVector(u,-f.y).multiplyScalar(a),h.copy(u).multiplyScalar(f.x).addScaledVector(l,-p.x).multiplyScalar(a),o[e].add(m),o[t].add(m),o[r].add(m),s[e].add(h),s[t].add(h),s[r].add(h))}let _=this.groups;_.length===0&&(_=[{start:0,count:e.count}]);for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)g(e.getX(t+0),e.getX(t+1),e.getX(t+2))}let v=new P,y=new P,b=new P,x=new P;function C(e){b.fromBufferAttribute(r,e),x.copy(b);let t=o[e];v.copy(t),v.sub(b.multiplyScalar(b.dot(t))).normalize(),y.crossVectors(x,t);let n=y.dot(s[e])<0?-1:1;a.setXYZW(e,v.x,v.y,v.z,n)}for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)C(e.getX(t+0)),C(e.getX(t+1)),C(e.getX(t+2))}}computeVertexNormals(){let e=this.index,t=this.getAttribute(`position`);if(t!==void 0){let n=this.getAttribute(`normal`);if(n===void 0)n=new At(new Float32Array(t.count*3),3),this.setAttribute(`normal`,n);else for(let e=0,t=n.count;e<t;e++)n.setXYZ(e,0,0,0);let r=new P,i=new P,a=new P,o=new P,s=new P,c=new P,l=new P,u=new P;if(e)for(let d=0,f=e.count;d<f;d+=3){let f=e.getX(d+0),p=e.getX(d+1),m=e.getX(d+2);r.fromBufferAttribute(t,f),i.fromBufferAttribute(t,p),a.fromBufferAttribute(t,m),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),o.fromBufferAttribute(n,f),s.fromBufferAttribute(n,p),c.fromBufferAttribute(n,m),o.add(l),s.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(p,s.x,s.y,s.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let e=0,o=t.count;e<o;e+=3)r.fromBufferAttribute(t,e+0),i.fromBufferAttribute(t,e+1),a.fromBufferAttribute(t,e+2),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),n.setXYZ(e+0,l.x,l.y,l.z),n.setXYZ(e+1,l.x,l.y,l.z),n.setXYZ(e+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)B.fromBufferAttribute(e,t),B.normalize(),e.setXYZ(t,B.x,B.y,B.z)}toNonIndexed(){function t(e,t){let n=e.array,r=e.itemSize,i=e.normalized,a=new n.constructor(t.length*r),o=0,s=0;for(let i=0,c=t.length;i<c;i++){o=e.isInterleavedBufferAttribute?t[i]*e.data.stride+e.offset:t[i]*r;for(let e=0;e<r;e++)a[s++]=n[o++]}return new At(a,r,i)}if(this.index===null)return console.warn(`THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.`),this;let n=new e,r=this.index.array,i=this.attributes;for(let e in i){let a=i[e],o=t(a,r);n.setAttribute(e,o)}let a=this.morphAttributes;for(let e in a){let i=[],o=a[e];for(let e=0,n=o.length;e<n;e++){let n=o[e],a=t(n,r);i.push(a)}n.morphAttributes[e]=i}n.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let e=0,t=o.length;e<t;e++){let t=o[e];n.addGroup(t.start,t.count,t.materialIndex)}return n}toJSON(){let e={metadata:{version:4.6,type:`BufferGeometry`,generator:`BufferGeometry.toJSON`}};if(e.uuid=this.uuid,e.type=this.type,this.name!==``&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let t=this.parameters;for(let n in t)t[n]!==void 0&&(e[n]=t[n]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let t in n){let r=n[t];e.data.attributes[t]=r.toJSON(e.data)}let r={},i=!1;for(let t in this.morphAttributes){let n=this.morphAttributes[t],a=[];for(let t=0,r=n.length;t<r;t++){let r=n[t];a.push(r.toJSON(e.data))}a.length>0&&(r[t]=a,i=!0)}i&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere={center:o.center.toArray(),radius:o.radius}),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone(t));let r=e.attributes;for(let e in r){let n=r[e];this.setAttribute(e,n.clone(t))}let i=e.morphAttributes;for(let e in i){let n=[],r=i[e];for(let e=0,i=r.length;e<i;e++)n.push(r[e].clone(t));this.morphAttributes[e]=n}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let e=0,t=a.length;e<t;e++){let t=a[e];this.addGroup(t.start,t.count,t.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let s=e.boundingSphere;return s!==null&&(this.boundingSphere=s.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:`dispose`})}},Vt=class e extends Bt{constructor(e=1,t=1,n=1,r=1,i=1,a=1){super(),this.type=`BoxGeometry`,this.parameters={width:e,height:t,depth:n,widthSegments:r,heightSegments:i,depthSegments:a};let o=this;r=Math.floor(r),i=Math.floor(i),a=Math.floor(a);let s=[],c=[],l=[],u=[],d=0,f=0;p(`z`,`y`,`x`,-1,-1,n,t,e,a,i,0),p(`z`,`y`,`x`,1,-1,n,t,-e,a,i,1),p(`x`,`z`,`y`,1,1,e,n,t,r,a,2),p(`x`,`z`,`y`,1,-1,e,n,-t,r,a,3),p(`x`,`y`,`z`,1,-1,e,t,n,r,i,4),p(`x`,`y`,`z`,-1,-1,e,t,-n,r,i,5),this.setIndex(s),this.setAttribute(`position`,new Nt(c,3)),this.setAttribute(`normal`,new Nt(l,3)),this.setAttribute(`uv`,new Nt(u,2));function p(e,t,n,r,i,a,p,m,h,g,_){let v=a/h,y=p/g,b=a/2,x=p/2,S=m/2,C=h+1,w=g+1,T=0,E=0,D=new P;for(let a=0;a<w;a++){let o=a*y-x;for(let s=0;s<C;s++)D[e]=(s*v-b)*r,D[t]=o*i,D[n]=S,c.push(D.x,D.y,D.z),D[e]=0,D[t]=0,D[n]=m>0?1:-1,l.push(D.x,D.y,D.z),u.push(s/h),u.push(1-a/g),T+=1}for(let e=0;e<g;e++)for(let t=0;t<h;t++){let n=d+t+C*e,r=d+t+C*(e+1),i=d+(t+1)+C*(e+1),a=d+(t+1)+C*e;s.push(n,r,a),s.push(r,i,a),E+=6}o.addGroup(f,E,_),f+=E,d+=T}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};function Ht(e){let t={};for(let n in e){t[n]={};for(let r in e[n]){let i=e[n][r];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn(`UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().`),t[n][r]=null):t[n][r]=i.clone():Array.isArray(i)?t[n][r]=i.slice():t[n][r]=i}}return t}function Ut(e){let t={};for(let n=0;n<e.length;n++){let r=Ht(e[n]);for(let e in r)t[e]=r[e]}return t}let Wt=/*@__PURE__*/ new P,Gt=/*@__PURE__*/ new P,Kt=/*@__PURE__*/ new C;var qt=class{constructor(e=new P(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,r){return this.normal.set(e,t,n),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let r=Wt.subVectors(n,t).cross(Gt.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(Wt),r=this.normal.dot(n);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let i=-(e.start.dot(this.normal)+this.constant)/r;return i<0||i>1?null:t.copy(e.start).addScaledVector(n,i)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Kt.getNormalMatrix(e),r=this.coplanarPoint(Wt).applyMatrix4(e),i=this.normal.applyMatrix3(n).normalize();return this.constant=-r.dot(i),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}};let V={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:`gl_FragColor = linearToOutputTexel( gl_FragColor );`,colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
		
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
		
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		
		#else
		
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distanceRGBA_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distanceRGBA_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},H={common:{diffuse:{value:/*@__PURE__*/ new Ot(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:/*@__PURE__*/ new C},alphaMap:{value:null},alphaMapTransform:{value:/*@__PURE__*/ new C},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:/*@__PURE__*/ new C}},envmap:{envMap:{value:null},envMapRotation:{value:/*@__PURE__*/ new C},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:/*@__PURE__*/ new C}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:/*@__PURE__*/ new C}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:/*@__PURE__*/ new C},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:/*@__PURE__*/ new C},normalScale:{value:/*@__PURE__*/ new S(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:/*@__PURE__*/ new C},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:/*@__PURE__*/ new C}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:/*@__PURE__*/ new C}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:/*@__PURE__*/ new C}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:/*@__PURE__*/ new Ot(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:/*@__PURE__*/ new Ot(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:/*@__PURE__*/ new C},alphaTest:{value:0},uvTransform:{value:/*@__PURE__*/ new C}},sprite:{diffuse:{value:/*@__PURE__*/ new Ot(16777215)},opacity:{value:1},center:{value:/*@__PURE__*/ new S(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:/*@__PURE__*/ new C},alphaMap:{value:null},alphaMapTransform:{value:/*@__PURE__*/ new C},alphaTest:{value:0}}},Jt={basic:{uniforms:/*@__PURE__*/ Ut([H.common,H.specularmap,H.envmap,H.aomap,H.lightmap,H.fog]),vertexShader:V.meshbasic_vert,fragmentShader:V.meshbasic_frag},lambert:{uniforms:/*@__PURE__*/ Ut([H.common,H.specularmap,H.envmap,H.aomap,H.lightmap,H.emissivemap,H.bumpmap,H.normalmap,H.displacementmap,H.fog,H.lights,{emissive:{value:/*@__PURE__*/ new Ot(0)}}]),vertexShader:V.meshlambert_vert,fragmentShader:V.meshlambert_frag},phong:{uniforms:/*@__PURE__*/ Ut([H.common,H.specularmap,H.envmap,H.aomap,H.lightmap,H.emissivemap,H.bumpmap,H.normalmap,H.displacementmap,H.fog,H.lights,{emissive:{value:/*@__PURE__*/ new Ot(0)},specular:{value:/*@__PURE__*/ new Ot(1118481)},shininess:{value:30}}]),vertexShader:V.meshphong_vert,fragmentShader:V.meshphong_frag},standard:{uniforms:/*@__PURE__*/ Ut([H.common,H.envmap,H.aomap,H.lightmap,H.emissivemap,H.bumpmap,H.normalmap,H.displacementmap,H.roughnessmap,H.metalnessmap,H.fog,H.lights,{emissive:{value:/*@__PURE__*/ new Ot(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:V.meshphysical_vert,fragmentShader:V.meshphysical_frag},toon:{uniforms:/*@__PURE__*/ Ut([H.common,H.aomap,H.lightmap,H.emissivemap,H.bumpmap,H.normalmap,H.displacementmap,H.gradientmap,H.fog,H.lights,{emissive:{value:/*@__PURE__*/ new Ot(0)}}]),vertexShader:V.meshtoon_vert,fragmentShader:V.meshtoon_frag},matcap:{uniforms:/*@__PURE__*/ Ut([H.common,H.bumpmap,H.normalmap,H.displacementmap,H.fog,{matcap:{value:null}}]),vertexShader:V.meshmatcap_vert,fragmentShader:V.meshmatcap_frag},points:{uniforms:/*@__PURE__*/ Ut([H.points,H.fog]),vertexShader:V.points_vert,fragmentShader:V.points_frag},dashed:{uniforms:/*@__PURE__*/ Ut([H.common,H.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:V.linedashed_vert,fragmentShader:V.linedashed_frag},depth:{uniforms:/*@__PURE__*/ Ut([H.common,H.displacementmap]),vertexShader:V.depth_vert,fragmentShader:V.depth_frag},normal:{uniforms:/*@__PURE__*/ Ut([H.common,H.bumpmap,H.normalmap,H.displacementmap,{opacity:{value:1}}]),vertexShader:V.meshnormal_vert,fragmentShader:V.meshnormal_frag},sprite:{uniforms:/*@__PURE__*/ Ut([H.sprite,H.fog]),vertexShader:V.sprite_vert,fragmentShader:V.sprite_frag},background:{uniforms:{uvTransform:{value:/*@__PURE__*/ new C},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:V.background_vert,fragmentShader:V.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:/*@__PURE__*/ new C}},vertexShader:V.backgroundCube_vert,fragmentShader:V.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:V.cube_vert,fragmentShader:V.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:V.equirect_vert,fragmentShader:V.equirect_frag},distanceRGBA:{uniforms:/*@__PURE__*/ Ut([H.common,H.displacementmap,{referencePosition:{value:/*@__PURE__*/ new P},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:V.distanceRGBA_vert,fragmentShader:V.distanceRGBA_frag},shadow:{uniforms:/*@__PURE__*/ Ut([H.lights,H.fog,{color:{value:/*@__PURE__*/ new Ot(0)},opacity:{value:1}}]),vertexShader:V.shadow_vert,fragmentShader:V.shadow_frag}};Jt.physical={uniforms:/*@__PURE__*/ Ut([Jt.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:/*@__PURE__*/ new C},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:/*@__PURE__*/ new C},clearcoatNormalScale:{value:/*@__PURE__*/ new S(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:/*@__PURE__*/ new C},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:/*@__PURE__*/ new C},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:/*@__PURE__*/ new C},sheen:{value:0},sheenColor:{value:/*@__PURE__*/ new Ot(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:/*@__PURE__*/ new C},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:/*@__PURE__*/ new C},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:/*@__PURE__*/ new C},transmissionSamplerSize:{value:/*@__PURE__*/ new S},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:/*@__PURE__*/ new C},attenuationDistance:{value:0},attenuationColor:{value:/*@__PURE__*/ new Ot(0)},specularColor:{value:/*@__PURE__*/ new Ot(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:/*@__PURE__*/ new C},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:/*@__PURE__*/ new C},anisotropyVector:{value:/*@__PURE__*/ new S},anisotropyMap:{value:null},anisotropyMapTransform:{value:/*@__PURE__*/ new C}}]),vertexShader:V.meshphysical_vert,fragmentShader:V.meshphysical_frag};let Yt=(1+Math.sqrt(5))/2,Xt=1/Yt;-Yt,-Xt,-Xt;var Zt=class e extends Bt{constructor(e=1,t=1,n=1,r=32,i=1,a=!1,o=0,s=Math.PI*2){super(),this.type=`CylinderGeometry`,this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:r,heightSegments:i,openEnded:a,thetaStart:o,thetaLength:s};let c=this;r=Math.floor(r),i=Math.floor(i);let l=[],u=[],d=[],f=[],p=0,m=[],h=n/2,g=0;_(),a===!1&&(e>0&&v(!0),t>0&&v(!1)),this.setIndex(l),this.setAttribute(`position`,new Nt(u,3)),this.setAttribute(`normal`,new Nt(d,3)),this.setAttribute(`uv`,new Nt(f,2));function _(){let a=new P,_=new P,v=0,y=(t-e)/n;for(let c=0;c<=i;c++){let l=[],g=c/i,v=g*(t-e)+e;for(let e=0;e<=r;e++){let t=e/r,i=t*s+o,c=Math.sin(i),m=Math.cos(i);_.x=v*c,_.y=-g*n+h,_.z=v*m,u.push(_.x,_.y,_.z),a.set(c,y,m).normalize(),d.push(a.x,a.y,a.z),f.push(t,1-g),l.push(p++)}m.push(l)}for(let n=0;n<r;n++)for(let r=0;r<i;r++){let a=m[r][n],o=m[r+1][n],s=m[r+1][n+1],c=m[r][n+1];(e>0||r!==0)&&(l.push(a,o,c),v+=3),(t>0||r!==i-1)&&(l.push(o,s,c),v+=3)}c.addGroup(g,v,0),g+=v}function v(n){let i=p,a=new S,m=new P,_=0,v=n===!0?e:t,y=n===!0?1:-1;for(let e=1;e<=r;e++)u.push(0,h*y,0),d.push(0,y,0),f.push(.5,.5),p++;let b=p;for(let e=0;e<=r;e++){let t=e/r*s+o,n=Math.cos(t),i=Math.sin(t);m.x=v*i,m.y=h*y,m.z=v*n,u.push(m.x,m.y,m.z),d.push(0,y,0),a.x=n*.5+.5,a.y=i*.5*y+.5,f.push(a.x,a.y),p++}for(let e=0;e<r;e++){let t=i+e,r=b+e;n===!0?l.push(r,r+1,t):l.push(r+1,r,t),_+=3}c.addGroup(g,_,n===!0?1:2),g+=_}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}};function Qt(e,t,n){return!e||!n&&e.constructor===t?e:typeof t.BYTES_PER_ELEMENT==`number`?new t(e):Array.prototype.slice.call(e)}function $t(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}var en=class{constructor(e,t,n,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r===void 0?new t.constructor(n):r,this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,r=t[n],i=t[n-1];validate_interval:{seek:{let a;linear_scan:{forward_scan:if(!(e<r)){for(let a=n+2;;){if(r===void 0){if(e<i)break forward_scan;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(i=r,r=t[++n],e<r)break seek}a=t.length;break linear_scan}if(!(e>=i)){let o=t[1];e<o&&(n=2,i=o);for(let a=n-2;;){if(i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(r=i,i=t[--n-1],e>=i)break seek}a=n,n=0;break linear_scan}break validate_interval}for(;n<a;){let r=n+a>>>1;e<t[r]?a=r:n=r+1}if(r=t[n],i=t[n-1],i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,i,r)}return this.interpolate_(n,i,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r;for(let e=0;e!==r;++e)t[e]=n[i+e];return t}interpolate_(){throw Error(`call to abstract method`)}intervalChanged_(){}},tn=class extends en{constructor(e,t,n,r){super(e,t,n,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:s,endingEnd:s}}intervalChanged_(e,t,n){let r=this.parameterPositions,i=e-2,a=e+1,o=r[i],s=r[a];if(o===void 0)switch(this.getSettings_().endingStart){case c:i=e,o=2*t-n;break;case l:i=r.length-2,o=t+r[i]-r[i+1];break;default:i=e,o=n}if(s===void 0)switch(this.getSettings_().endingEnd){case c:a=e,s=2*n-t;break;case l:a=1,s=n+r[1]-r[0];break;default:a=e-1,s=t}let u=(n-t)*.5,d=this.valueSize;this._weightPrev=u/(t-o),this._weightNext=u/(s-n),this._offsetPrev=i*d,this._offsetNext=a*d}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,f=this._weightNext,p=(n-t)/(r-t),m=p*p,h=m*p,g=-d*h+2*d*m-d*p,_=(1+d)*h+(-1.5-2*d)*m+(-.5+d)*p+1,v=(-1-f)*h+(1.5+f)*m+.5*p,y=f*h-f*m;for(let e=0;e!==o;++e)i[e]=g*a[l+e]+_*a[c+e]+v*a[s+e]+y*a[u+e];return i}},nn=class extends en{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=(n-t)/(r-t),u=1-l;for(let e=0;e!==o;++e)i[e]=a[c+e]*u+a[s+e]*l;return i}},rn=class extends en{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e){return this.copySampleValue_(e-1)}},an=class{constructor(e,t,n,r){if(e===void 0)throw Error(`THREE.KeyframeTrack: track name is undefined`);if(t===void 0||t.length===0)throw Error(`THREE.KeyframeTrack: no keyframes in track named `+e);this.name=e,this.times=Qt(t,this.TimeBufferType),this.values=Qt(n,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Qt(e.times,Array),values:Qt(e.values,Array)};let t=e.getInterpolation();t!==e.DefaultInterpolation&&(n.interpolation=t)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new rn(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new nn(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new tn(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case i:t=this.InterpolantFactoryMethodDiscrete;break;case a:t=this.InterpolantFactoryMethodLinear;break;case o:t=this.InterpolantFactoryMethodSmooth}if(t===void 0){let t=`unsupported interpolation for `+this.ValueTypeName+` keyframe track named `+this.name;if(this.createInterpolant===void 0){if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(t)}return console.warn(`THREE.KeyframeTrack:`,t),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return i;case this.InterpolantFactoryMethodLinear:return a;case this.InterpolantFactoryMethodSmooth:return o}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]*=e}return this}trim(e,t){let n=this.times,r=n.length,i=0,a=r-1;for(;i!==r&&n[i]<e;)++i;for(;a!==-1&&n[a]>t;)--a;if(++a,i!==0||a!==r){i>=a&&(a=Math.max(a,1),i=a-1);let e=this.getValueSize();this.times=n.slice(i,a),this.values=this.values.slice(i*e,a*e)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error(`THREE.KeyframeTrack: Invalid value size in track.`,this),e=!1);let n=this.times,r=this.values,i=n.length;i===0&&(console.error(`THREE.KeyframeTrack: Track is empty.`,this),e=!1);let a=null;for(let t=0;t!==i;t++){let r=n[t];if(typeof r==`number`&&isNaN(r)){console.error(`THREE.KeyframeTrack: Time is not a valid number.`,this,t,r),e=!1;break}if(a!==null&&a>r){console.error(`THREE.KeyframeTrack: Out of order keys.`,this,t,r,a),e=!1;break}a=r}if(r!==void 0&&$t(r))for(let t=0,n=r.length;t!==n;++t){let n=r[t];if(isNaN(n)){console.error(`THREE.KeyframeTrack: Value is not a valid number.`,this,t,n),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),r=this.getInterpolation()===o,i=e.length-1,a=1;for(let o=1;o<i;++o){let i=!1,s=e[o];if(s!==e[o+1]&&(o!==1||s!==e[0])){if(r)i=!0;else{let e=o*n,r=e-n,a=e+n;for(let o=0;o!==n;++o){let n=t[e+o];if(n!==t[r+o]||n!==t[a+o]){i=!0;break}}}}if(i){if(o!==a){e[a]=e[o];let r=o*n,i=a*n;for(let e=0;e!==n;++e)t[i+e]=t[r+e]}++a}}if(i>0){e[a]=e[i];for(let e=i*n,r=a*n,o=0;o!==n;++o)t[r+o]=t[e+o];++a}return a===e.length?(this.times=e,this.values=t):(this.times=e.slice(0,a),this.values=t.slice(0,a*n)),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,r=new n(this.name,e,t);return r.createInterpolant=this.createInterpolant,r}};an.prototype.TimeBufferType=Float32Array,an.prototype.ValueBufferType=Float32Array,an.prototype.DefaultInterpolation=a;var on=class extends an{constructor(e,t,n){super(e,t,n)}};on.prototype.ValueTypeName=`bool`,on.prototype.ValueBufferType=Array,on.prototype.DefaultInterpolation=i,on.prototype.InterpolantFactoryMethodLinear=void 0,on.prototype.InterpolantFactoryMethodSmooth=void 0;var sn=class extends an{};sn.prototype.ValueTypeName=`color`;var cn=class extends an{};cn.prototype.ValueTypeName=`number`;var ln=class extends en{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=(n-t)/(r-t),c=e*o;for(let e=c+o;c!==e;c+=4)le.slerpFlat(i,0,a,c-o,a,c,s);return i}},un=class extends an{InterpolantFactoryMethodLinear(e){return new ln(this.times,this.values,this.getValueSize(),e)}};un.prototype.ValueTypeName=`quaternion`,un.prototype.InterpolantFactoryMethodSmooth=void 0;var dn=class extends an{constructor(e,t,n){super(e,t,n)}};dn.prototype.ValueTypeName=`string`,dn.prototype.ValueBufferType=Array,dn.prototype.DefaultInterpolation=i,dn.prototype.InterpolantFactoryMethodLinear=void 0,dn.prototype.InterpolantFactoryMethodSmooth=void 0;var fn=class extends an{};fn.prototype.ValueTypeName=`vector`;let pn=/* @__PURE__ */ RegExp(`[\\[\\]\\.:\\/]`,`g`),mn=/* @__PURE__ */ RegExp(`^((?:[^\\[\\]\\.:\\/]+[\\/:])*)([^\\[\\]:\\/]+)?(?:\\.([^\\[\\]\\.:\\/]+)(?:\\[(.+)\\])?)?\\.([^\\[\\]\\.:\\/]+)(?:\\[(.+)\\])?$`),hn=[`material`,`materials`,`bones`,`map`];var gn=class{constructor(e,t,n){let r=n||U.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,r=this._bindings[n];r!==void 0&&r.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let r=this._targetGroup.nCachedObjects_,i=n.length;r!==i;++r)n[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},U=class e{constructor(t,n,r){this.path=n,this.parsedPath=r||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,r){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,r):new e(t,n,r)}static sanitizeNodeName(e){return e.replace(/\s/g,`_`).replace(pn,``)}static parseTrackName(e){let t=mn.exec(e);if(t===null)throw Error(`PropertyBinding: Cannot parse trackName: `+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=n.nodeName&&n.nodeName.lastIndexOf(`.`);if(r!==void 0&&r!==-1){let e=n.nodeName.substring(r+1);hn.indexOf(e)!==-1&&(n.nodeName=n.nodeName.substring(0,r),n.objectName=e)}if(n.propertyName===null||n.propertyName.length===0)throw Error(`PropertyBinding: can not parse propertyName from trackName: `+e);return n}static findNode(e,t){if(t===void 0||t===``||t===`.`||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(e){for(let r=0;r<e.length;r++){let i=e[r];if(i.name===t||i.uuid===t)return i;let a=n(i.children);if(a)return a}return null},r=n(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)e[t++]=n[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let t=this.node,n=this.parsedPath,r=n.objectName,i=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){console.warn(`THREE.PropertyBinding: No target node found for track: `+this.path+`.`);return}if(r){let e=n.objectIndex;switch(r){case`materials`:if(!t.material){console.error(`THREE.PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.materials){console.error(`THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.`,this);return}t=t.material.materials;break;case`bones`:if(!t.skeleton){console.error(`THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.`,this);return}t=t.skeleton.bones;for(let n=0;n<t.length;n++)if(t[n].name===e){e=n;break}break;case`map`:if(`map`in t){t=t.map;break}if(!t.material){console.error(`THREE.PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.map){console.error(`THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.`,this);return}t=t.material.map;break;default:if(t[r]===void 0){console.error(`THREE.PropertyBinding: Can not bind to objectName of node undefined.`,this);return}t=t[r]}if(e!==void 0){if(t[e]===void 0){console.error(`THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.`,this,t);return}t=t[e]}}let o=t[i];if(o===void 0){let e=n.nodeName;console.error(`THREE.PropertyBinding: Trying to update property for track: `+e+`.`+i+` but it wasn't found.`,t);return}let s=this.Versioning.None;this.targetObject=t,t.needsUpdate===void 0?t.matrixWorldNeedsUpdate!==void 0&&(s=this.Versioning.MatrixWorldNeedsUpdate):s=this.Versioning.NeedsUpdate;let c=this.BindingType.Direct;if(a!==void 0){if(i===`morphTargetInfluences`){if(!t.geometry){console.error(`THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.`,this);return}if(!t.geometry.morphAttributes){console.error(`THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.`,this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=a}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][s]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};U.Composite=gn,U.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},U.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},U.prototype.GetterByBindingType=[U.prototype._getValue_direct,U.prototype._getValue_array,U.prototype._getValue_arrayElement,U.prototype._getValue_toArray],U.prototype.SetterByBindingTypeAndVersioning=[[U.prototype._setValue_direct,U.prototype._setValue_direct_setNeedsUpdate,U.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[U.prototype._setValue_array,U.prototype._setValue_array_setNeedsUpdate,U.prototype._setValue_array_setMatrixWorldNeedsUpdate],[U.prototype._setValue_arrayElement,U.prototype._setValue_arrayElement_setNeedsUpdate,U.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[U.prototype._setValue_fromArray,U.prototype._setValue_fromArray_setNeedsUpdate,U.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];let _n=/*@__PURE__*/ new P,vn=/*@__PURE__*/ new P;var yn=class{constructor(e=new P,t=new P){this.start=e,this.end=t}set(e,t){return this.start.copy(e),this.end.copy(t),this}copy(e){return this.start.copy(e.start),this.end.copy(e.end),this}getCenter(e){return e.addVectors(this.start,this.end).multiplyScalar(.5)}delta(e){return e.subVectors(this.end,this.start)}distanceSq(){return this.start.distanceToSquared(this.end)}distance(){return this.start.distanceTo(this.end)}at(e,t){return this.delta(t).multiplyScalar(e).add(this.start)}closestPointToPointParameter(e,t){_n.subVectors(e,this.start),vn.subVectors(this.end,this.start);let n=vn.dot(vn),r=vn.dot(_n)/n;return t&&(r=_(r,0,1)),r}closestPointToPoint(e,t,n){let r=this.closestPointToPointParameter(e,t);return this.delta(n).multiplyScalar(r).add(this.start)}applyMatrix4(e){return this.start.applyMatrix4(e),this.end.applyMatrix4(e),this}equals(e){return e.start.equals(this.start)&&e.end.equals(this.end)}clone(){return new this.constructor().copy(this)}};typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`register`,{detail:{revision:`170`}})),typeof window<`u`&&(window.__THREE__?console.warn(`WARNING: Multiple instances of Three.js being imported.`):window.__THREE__=`170`);let bn=1e6,xn=.1;function Sn(e,t,n){return`${Math.round(e*bn)} ${Math.round(t*bn)} ${Math.round(n*bn)}`}function W(e,t){return e.x*t.x+e.y*t.y+e.z*t.z}function Cn(e,t){return{x:e.x-t.x,y:e.y-t.y,z:e.z-t.z}}function wn(e){let t=Math.hypot(e.x,e.y,e.z);return t>0?{x:e.x/t,y:e.y/t,z:e.z/t}:{x:0,y:0,z:0}}function Tn(e,t){return Math.hypot(e.center.x-t.center.x,e.center.y-t.center.y,e.center.z-t.center.z)<.001&&Math.abs(e.radius-t.radius)<1e-4&&Math.abs(Math.abs(W(e.axis,t.axis))-1)<1e-6}function En(e,t){return{x:e.y*t.z-e.z*t.y,y:e.z*t.x-e.x*t.z,z:e.x*t.y-e.y*t.x}}function Dn(e){let t=Math.hypot(e.x,e.y,e.z)||1;return{x:e.x/t,y:e.y/t,z:e.z/t}}function On(e,t){let n=`${e}|${t.map(e=>typeof e==`number`?Math.round(e*1e4):e).join(`|`)}`,r=2166136261;for(let e=0;e<n.length;e++)r^=n.charCodeAt(e),r=Math.imul(r,16777619)>>>0;return`${e}-${r.toString(16)}`}function kn(e){let t=(e.index?e.toNonIndexed():e).getAttribute(`position`),n=[],r=/* @__PURE__ */ new Map,i=[],a=[];for(let e=0;e+2<t.count;e+=3){let o=[];for(let i=0;i<3;i++){let a=t.getX(e+i),s=t.getY(e+i),c=t.getZ(e+i),l=Sn(a,s,c),u=r.get(l);u===void 0&&(u=n.length,n.push({x:a,y:s,z:c}),r.set(l,u)),o.push(u)}o[0]!==o[1]&&o[1]!==o[2]&&o[0]!==o[2]&&(i.push([o[0],o[1],o[2]]),a.push(e/3))}let o=i.map(([e,t,r])=>{let i=n[e],a=n[t],o=n[r];return Dn(En({x:a.x-i.x,y:a.y-i.y,z:a.z-i.z},{x:o.x-i.x,y:o.y-i.y,z:o.z-i.z}))}),s=/* @__PURE__ */ new Map;return i.forEach((e,t)=>{for(let n=0;n<3;n++){let r=e[n],i=e[(n+1)%3],a=r<i?`${r}_${i}`:`${i}_${r}`,o=s.get(a);o?o.push(t):s.set(a,[t])}}),{verts:n,faces:i,rawIndexOf:a,edgeFaces:s,faceNormal:o}}function An(e){let{faces:t,faceNormal:n,edgeFaces:r}=e,i=new Int32Array(t.length).fill(-1),a=[],o=Math.cos(.5*Math.PI/180);for(let e=0;e<t.length;e++){if(i[e]!==-1)continue;let s=a.length,c=n[e];a.push(c),i[e]=s;let l=[e];for(;l.length>0;){let e=l.pop();for(let a=0;a<3;a++){let u=t[e][a],d=t[e][(a+1)%3],f=u<d?`${u}_${d}`:`${d}_${u}`;for(let e of r.get(f)??[])i[e]===-1&&W(n[e],c)>o&&(i[e]=s,l.push(e))}}}return{planeOf:i,normals:a}}function jn(e,t){let n=0,r=0,i=0,a=0,o=0,s=0;for(let c=0;c<t.length;c++){let l=e[t[c]],u=e[t[(c+1)%t.length]];n+=(l.y-u.y)*(l.z+u.z),r+=(l.z-u.z)*(l.x+u.x),i+=(l.x-u.x)*(l.y+u.y),a+=l.x,o+=l.y,s+=l.z}return{point:{x:a/t.length,y:o/t.length,z:s/t.length},normal:Dn({x:n,y:r,z:i})}}function Mn(e){let t=Dn(En(Math.abs(e.z)<.9?{x:0,y:0,z:1}:{x:1,y:0,z:0},e));return{u:t,v:En(e,t)}}function Nn(e){let t=e;return()=>{t|=0,t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function Pn(e,t,n){let r=t.x-e.x,i=t.y-e.y,a=n.x-e.x,o=n.y-e.y,s=r*o-i*a;if(Math.abs(s)<1e-12)return null;let c=(e.x*e.x+e.y*e.y)/2,l=(t.x*t.x+t.y*t.y)/2,u=(n.x*n.x+n.y*n.y)/2,d=((l-c)*o-(u-c)*i)/s,f=(r*(u-c)-a*(l-c))/s;return{cx:d,cy:f,r:Math.hypot(e.x-d,e.y-f)}}function Fn(e){let t=0,n=0,r=0,i=0,a=0,o=0,s=0,c=0,l=e.length;for(let l of e){let e=l.x*l.x+l.y*l.y;t+=l.x,n+=l.y,r+=l.x*l.x,i+=l.y*l.y,a+=l.x*l.y,o+=l.x*e,s+=l.y*e,c+=e}let u=[[r,a,t],[a,i,n],[t,n,l]],d=[-o,-s,-c],f=e=>e[0][0]*(e[1][1]*e[2][2]-e[1][2]*e[2][1])-e[0][1]*(e[1][0]*e[2][2]-e[1][2]*e[2][0])+e[0][2]*(e[1][0]*e[2][1]-e[1][1]*e[2][0]),p=f(u);if(Math.abs(p)<1e-12)return null;let m=e=>{let t=u.map((t,n)=>t.map((t,r)=>r===e?d[n]:t));return f(t)/p},h=m(0),g=m(1),_=m(2),v=h*h/4+g*g/4-_;return v<=0?null:{cx:-h/2,cy:-g/2,r:Math.sqrt(v)}}function In(e){let t=e.length;if(t<9)return null;let n=1/0,r=0;for(let i=0;i<t;i++){let a=e[i],o=e[(i+1)%t],s=Math.hypot(o.x-a.x,o.y-a.y);n=Math.min(n,s),r=Math.max(r,s)}if(n<=0||r/n>1.5)return null;let i=Nn(42),a=null,o=Math.min(2e3,t*20);for(let n=0;n<o;n++){let n=Math.floor(i()*t),r=Math.floor(i()*t),o=Math.floor(i()*t);if(n===r||r===o||n===o)continue;let s=Pn(e[n],e[r],e[o]);if(!s||s.r<=0)continue;let c=Math.max(.01,s.r*.005),l=0;for(let t of e)Math.abs(Math.hypot(t.x-s.cx,t.y-s.cy)-s.r)<=c&&l++;(!a||l>a.inliers)&&(a={c:s,tol:c,inliers:l})}return!a||a.inliers/t<.98?null:Fn(e.filter(e=>Math.abs(Math.hypot(e.x-a.c.cx,e.y-a.c.cy)-a.c.r)<=a.tol))??a.c}function Ln(e){let t=e.flat(),n=t.length;if(n<6)return null;let r=(e,t)=>(Math.atan2(e.y-t.cy,e.x-t.cx)*180/Math.PI+360)%360,i=[];{let t=0;for(let n of e)i.push(t),t+=n.length}let a=Nn(43),o=null,s=Math.min(2e3,n*20);for(let c=0;c<s;c++){let s=Math.floor(a()*n),c=Math.floor(a()*n),l=Math.floor(a()*n);if(s===c||c===l||s===l)continue;let u=Pn(t[s],t[c],t[l]);if(!u||u.r<=0)continue;let d=Math.max(.01,u.r*.005),f=t.map(e=>Math.abs(Math.hypot(e.x-u.cx,e.y-u.cy)-u.r)<=d),p=!0,m=0,h=[];for(let n=0;n<e.length;n++){let a=e[n].length,o=i[n],s=e=>o+(e%a+a)%a,c=e=>r(t[s(e)],u),l=e=>f[s(e)],d=(e,t)=>{let n=Math.abs(t-e);return Math.min(n,360-n)},g=e=>d(c(e),c(e+1)),_=0,v=-1;for(let e=0;e<a;e++)if(!l(e)){v=e;break}if(v!==-1)_=v,p=!1;else for(let e=0;e<a;e++)if(g(e)>60){_=(e+1)%a;break}let y=e=>(_+e)%a;e.length===1&&(m=g(y(a-1)));let b=(e,t)=>{let r=[];for(let n=e;n<=t;n++)r.push(y(n));return{cycle:n,verts:r}},x=-1,S=l(y(a-1)),C=c(y(a-1));for(let e=0;e<a;e++){let t=l(y(e)),n=c(y(e)),r=t&&S?d(C,n):1/0;t?(x===-1||r>60)&&(x!==-1&&h.push(b(x,e-1)),x=e):x!==-1&&(h.push(b(x,e-1)),x=-1),C=n,S=t}x!==-1&&h.push(b(x,a-1))}let g=h.filter(e=>e.verts.length>=2),_=g.reduce((e,t)=>e+t.verts.length,0),v=_>=6;if(v&&g.length>0){let e=g.map(e=>{let n=i[e.cycle],a=t[n+e.verts[0]],o=t[n+e.verts[1]],s=t[n+e.verts[e.verts.length-1]],c=(r(o,u)-r(a,u)+360)%360<180;return{from:r(c?a:s,u),to:r(c?s:a,u)}}).sort((e,t)=>e.from-t.from),n=0;for(let t=0;t<e.length;t++){let r=e[(t+1)%e.length];n=Math.max(n,(r.from-e[t].to+720)%360)}v=360-n>=120}v&&(!o||_>o.total)&&(o={c:u,tol:d,chains:g,total:_,full:p&&e.length===1&&g.length===1&&m<=60})}if(!o)return null;let c=[];for(let e of o.chains){let n=i[e.cycle];for(let r of e.verts)c.push(t[n+r])}return{c:Fn(c)??o.c,chains:o.chains,full:o.full}}function Rn(e){let t=kn(e),{verts:n,faces:r}=t,{planeOf:i,normals:a}=An(t),o=a.map(()=>({x:0,y:0,z:0,n:0}));r.forEach((e,t)=>{let r=o[i[t]];for(let t of e)r.x+=n[t].x,r.y+=n[t].y,r.z+=n[t].z,r.n++});let s=o.map((e,t)=>{let n={x:e.x/e.n,y:e.y/e.n,z:e.z/e.n};return{kind:`plane`,id:On(`plane`,[a[t].x,a[t].y,a[t].z,n.x,n.y,n.z]),point:n,normal:a[t]}}),c=/* @__PURE__ */ new Map;r.forEach((e,n)=>{for(let r=0;r<3;r++){let a=e[r],o=e[(r+1)%3],s=a<o?`${a}_${o}`:`${o}_${a}`,l=(t.edgeFaces.get(s)??[]).find(e=>e!==n);(l===void 0||i[l]!==i[n])&&c.set(`${i[n]}:${a}`,o)}});let l=/* @__PURE__ */ new Set,u=[];for(let e of[...c.keys()]){let t=e.indexOf(`:`),r=Number(e.slice(0,t)),i=Number(e.slice(t+1)),a=[],o=i,s=n.length+2;for(;s-->0;){let e=c.get(`${r}:${o}`);if(e===void 0)break;let t=`${r}:${o}:${e}`;if(l.has(t))break;l.add(t),a.push(o),o=e}a.length>=3&&u.push({plane:r,verts:a})}let d=[],f=[],p=/* @__PURE__ */ new Set,m=/* @__PURE__ */ new Set,h=(e,t)=>{let n=Sn(e.x,e.y,e.z),r=Sn(t.x,t.y,t.z);if(n===r)return;let i=n<r?`${n}|${r}`:`${r}|${n}`;p.has(i)||(p.add(i),f.push({kind:`edge`,id:On(`edge`,[i]),a:e,b:t}))},g=[],_=/* @__PURE__ */ new Map;for(let{plane:e,verts:t}of u){let n=_.get(e);n?n.push(t):_.set(e,[t])}for(let[e,t]of _){let r=[],i=[];for(let o of t){let t=jn(n,o),{u:s,v:c}=Mn(t.normal),l=In(o.map(e=>{let t=n[e];return{x:W(t,s),y:W(t,c)}}));if(l){let n=W(t.point,t.normal),r={x:s.x*l.cx+c.x*l.cy+t.normal.x*n,y:s.y*l.cx+c.y*l.cy+t.normal.y*n,z:s.z*l.cx+c.z*l.cy+t.normal.z*n};d.push({kind:`circle`,id:On(`circle`,[r.x,r.y,r.z,t.normal.x,t.normal.y,t.normal.z,l.r]),center:r,axis:t.normal,radius:l.r,inner:W(t.normal,a[e])<0});for(let e=0;e<o.length;e++){let t=o[e],n=o[(e+1)%o.length];m.add(t<n?`${t}_${n}`:`${n}_${t}`)}}else r.push(o),i.push(t.normal),g.push({pts3:o.map(e=>n[e]),idx:o})}if(r.length===0)continue;let{u:o,v:c}=Mn(a[e]),l=Ln(r.map(e=>e.map(e=>{let t=n[e];return{x:W(t,o),y:W(t,c)}})));if(!l)continue;let u=W(s[e].point,a[e]),f={x:o.x*l.c.cx+c.x*l.c.cy+a[e].x*u,y:o.y*l.c.cx+c.y*l.c.cy+a[e].y*u,z:o.z*l.c.cx+c.z*l.c.cy+a[e].z*u},p=0;for(let t of l.chains)W(i[t.cycle],a[e])<0&&(p+=t.verts.length);let h={kind:`circle`,id:On(`circle`,[f.x,f.y,f.z,a[e].x,a[e].y,a[e].z,l.c.r]),center:f,axis:a[e],radius:l.c.r,inner:p*2>l.chains.reduce((e,t)=>e+t.verts.length,0),...l.full?{}:{arcs:l.chains.map(e=>e.verts.map(t=>n[r[e.cycle][t]]))}};if(!d.some(e=>Tn(e,h))){d.push(h);for(let e of l.chains){let t=r[e.cycle],n=e.verts.length-+!l.full;for(let r=0;r<n;r++){let n=t[e.verts[r]],i=t[(e.verts[r]+1)%t.length];m.add(n<i?`${n}_${i}`:`${i}_${n}`)}}}}for(let{pts3:e,idx:t}of g){let n=e.length,r=(r,i)=>{for(let e=r;e!==i;e=(e+1)%n){let r=t[e],i=t[(e+1)%n];if(m.has(r<i?`${r}_${i}`:`${i}_${r}`))return}h(e[r],e[i])},i=0;for(let t=0;t<n;t++){let a=(t+1)%n,o=(a+1)%n,s={x:e[a].x-e[t].x,y:e[a].y-e[t].y,z:e[a].z-e[t].z},c={x:e[o].x-e[a].x,y:e[o].y-e[a].y,z:e[o].z-e[a].z},l=Math.hypot(s.x,s.y,s.z),u=Math.hypot(c.x,c.y,c.z);l>0&&u>0&&W(s,c)/(l*u)>1-1e-9||(r(i,a),i=a)}}let v=Math.cos(30*Math.PI/180),y=/* @__PURE__ */ new Map,b=[];for(let[e,n]of t.edgeFaces){if(n.length>=2&&W(t.faceNormal[n[0]],t.faceNormal[n[1]])>=v)continue;b.push(e);let[r,i]=e.split(`_`).map(Number);for(let[t,n]of[[r,i],[i,r]]){let r=y.get(t);r?r.push({other:n,key:e}):y.set(t,[{other:n,key:e}])}}let x=/* @__PURE__ */ new Set;for(let e of b){if(x.has(e))continue;let[r,i]=e.split(`_`).map(Number);x.add(e);let a=[r,i],o=r,s=i,c=n.length+2,l=!1;for(;c-->0;){let e=(y.get(s)??[]).filter(e=>!x.has(e.key));if(e.length===0)break;let t=e[0];if(e.length>1){let r=wn(Cn(n[s],n[o])),i=-1/0;for(let a of e){let e=W(r,wn(Cn(n[a.other],n[s])));e>i&&(i=e,t=a)}}if(x.add(t.key),t.other===a[0]){l=!0;break}a.push(t.other),o=s,s=t.other}if(!l)continue;let u=a.map(e=>n[e]),f=jn(u,u.map((e,t)=>t)),{u:p,v:m}=Mn(f.normal),h=In(u.map(e=>({x:W(e,p),y:W(e,m)})));if(!h)continue;let g=W(f.point,f.normal),_={x:p.x*h.cx+m.x*h.cy+f.normal.x*g,y:p.y*h.cx+m.y*h.cy+f.normal.y*g,z:p.z*h.cx+m.z*h.cy+f.normal.z*g},v=0;for(let e=0;e<a.length;e++){let r=a[e],i=a[(e+1)%a.length],o=t.edgeFaces.get(r<i?`${r}_${i}`:`${i}_${r}`)??[];if(o.length<2)continue;let s=wn({x:t.faceNormal[o[0]].x+t.faceNormal[o[1]].x,y:t.faceNormal[o[0]].y+t.faceNormal[o[1]].y,z:t.faceNormal[o[0]].z+t.faceNormal[o[1]].z}),c={x:(n[r].x+n[i].x)/2,y:(n[r].y+n[i].y)/2,z:(n[r].z+n[i].z)/2};v+=W(s,wn(Cn(c,_)))}let b={kind:`circle`,id:On(`circle`,[_.x,_.y,_.z,f.normal.x,f.normal.y,f.normal.z,h.r]),center:_,axis:f.normal,radius:h.r,inner:v<0};d.some(e=>Tn(e,b))||d.push(b)}let S=Math.floor((e.index?e.toNonIndexed():e).getAttribute(`position`).count/3),C=new Int32Array(S).fill(-1);r.forEach((e,n)=>{C[t.rawIndexOf[n]]=i[n]});let w=u.map(({plane:e,verts:t})=>({plane:e,points:t.map(e=>n[e])})),T=s.map(()=>({minU:1/0,maxU:-1/0,minV:1/0,maxV:-1/0})),E=s.map(()=>null);r.forEach((e,t)=>{let r=i[t],o=E[r];o||(o=Mn(a[r]),E[r]=o);for(let t of e){let e=n[t],i=W(e,o.u),a=W(e,o.v),s=T[r];i<s.minU&&(s.minU=i),i>s.maxU&&(s.maxU=i),a<s.minV&&(s.minV=a),a>s.maxV&&(s.maxV=a)}});let D=new Int32Array(s.length),O=[];for(let e=0;e<s.length;e++){let t=T[e],n=t.maxU-t.minU>=xn&&t.maxV-t.minV>=xn;D[e]=n?O.length:-1,n&&O.push(s[e])}let k=w.filter(e=>D[e.plane]>=0).map(e=>({plane:D[e.plane],points:e.points})),ee=new Int32Array(C.length);for(let e=0;e<C.length;e++){let t=C[e];ee[e]=t<0?-1:D[t]}return{planes:O,circles:d.filter(e=>e.radius*2>=xn),edges:f.filter(e=>Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y,e.b.z-e.a.z)>=xn),paths:[],faceToPlane:ee,planeLoops:k}}function zn(e,t){switch(e){case`min`:return[0,t];case`max`:return[-t,0];case`mid`:return[-t/2,t/2]}}function Bn(e){if(e.kind===`cylinder`)return e.calibration;let[t,n]=zn(e.origin.z,e.sizeZ);return{aOriginDeg:0,axisZ:(t+n)/2,effectiveRadius:Math.hypot(e.sizeY,e.sizeZ)/2}}function Vn(e){return e.kind===`pocket`||e.kind===`profile`||e.kind===`slicePocket`}function Hn(){return{position:{x:0,y:0,z:0},rotationDeg:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}}function Un(e){if(e.kind===`box`)return new Vt(e.size.x,e.size.y,e.size.z);if(e.kind===`artwork`)return new Bt;let t=new Zt(e.diameter/2,e.diameter/2,e.length,48);return t.rotateZ(Math.PI/2),t}let Wn=/* @__PURE__ */ new Map;function Gn(e){let t=e.kind===`box`?`box|${e.size.x}|${e.size.y}|${e.size.z}`:e.kind===`artwork`?`artwork|${e.id}`:`cylinder|${e.diameter}|${e.length}`,n=Wn.get(t);return n||(n=Rn(Un(e).toNonIndexed()),Wn.set(t,n)),n}function Kn(e,t){let n=e=>`p:${t}:${e}`;return{planes:e.planes.map(e=>({...e,id:n(e.id)})),circles:e.circles.map(e=>({...e,id:n(e.id)})),edges:e.edges.map(e=>({...e,id:n(e.id)})),paths:e.paths.map(e=>({...e,id:n(e.id)})),planeLoops:e.planeLoops,faceToPlane:e.faceToPlane}}function qn(e){let t=t=>e.height-t;if(e.presentation===`flat`)return e.paths.map(n=>n.map(n=>({x:n.x-e.width/2,y:t(n.y)-e.height/2,z:0})));let n=e.wrapDiameter/2,r=e.wrapAngle/360*Math.PI*e.wrapDiameter/Math.max(e.width,1e-9),i=e.wrapAngle*Math.PI/180;return e.paths.map(a=>a.map(a=>{let o=(a.x/e.width-.5)*i;return{x:(t(a.y)-e.height/2)*r,y:n*Math.sin(o),z:n*Math.cos(o)}}))}function Jn(e){return{planes:[],circles:[],edges:[],paths:qn(e).map((t,n)=>({kind:`path`,id:`p:${e.id}:path:${n}`,points:t})),faceToPlane:/* @__PURE__ */ new Int32Array,planeLoops:[]}}function Yn(e,t,n,r){let i=[];e&&t&&i.push({id:`model`,geometry:e,features:t,transform:n});for(let e of r)e.kind===`artwork`?i.push({id:e.id,geometry:new Bt,features:Jn(e),transform:e.transform,artworkFrame:e.presentation===`wrapped`?{kind:`wrapped`,diameter:e.wrapDiameter}:{kind:`flat`}}):i.push({id:e.id,geometry:Un(e).toNonIndexed(),features:Kn(Gn(e),e.id),transform:e.transform});return i}function Xn(e){let t=/^p:([^:]+):(.+)$/.exec(e);return t?{primId:t[1],featureId:t[2]}:null}let Zn=`op-edges`;function Qn(e,t){if(t.axisMode!==`4-axis`)return null;let n=Bn(t),[r,i]=t.kind===`cylinder`?zn(t.xOrigin,t.length):zn(t.origin.x,t.sizeX),a=(e,t,r)=>({kind:`circle`,id:e,center:{x:t,y:0,z:n.axisZ},axis:{x:1,y:0,z:0},radius:r/2,inner:!1}),o=[a(`o:stock:start`,r,n.effectiveRadius*2),a(`o:stock:end`,i,n.effectiveRadius*2)];for(let t of e)t.kind===`faceCylinder`&&(o.push(a(`o:face:${t.id}:start`,t.xStart,t.targetDiameter)),o.push(a(`o:face:${t.id}:end`,t.xEnd,t.targetDiameter)));return{id:Zn,geometry:new Bt,features:{planes:[],circles:o,edges:[],paths:[],faceToPlane:/* @__PURE__ */ new Int32Array,planeLoops:[]},transform:Hn()}}function $n(e,t){let n=typeof t==`string`?Xn(t):null,r=n?e.find(e=>e.id===n.primId):typeof t==`string`&&t.startsWith(`o:`)?e.find(e=>e.id===Zn):e.find(e=>e.id===`model`);if(!r)return null;let i=r.features.planes.findIndex(e=>e.id===t);if(i>=0)return{source:r,kind:`plane`,index:i,feature:r.features.planes[i]};let a=r.features.circles.findIndex(e=>e.id===t);if(a>=0)return{source:r,kind:`circle`,index:a,feature:r.features.circles[a]};let o=r.features.edges.findIndex(e=>e.id===t);if(o>=0)return{source:r,kind:`edge`,index:o,feature:r.features.edges[o]};let s=r.features.paths.findIndex(e=>e.id===t);return s>=0?{source:r,kind:`path`,index:s,feature:r.features.paths[s]}:null}function er(e,t){let n=/* @__PURE__ */ new Map;for(let r of t){let t=$n(e,r);if(!t)continue;let i=n.get(t.source.id)??[];i.push(r),n.set(t.source.id,i)}return e.filter(e=>n.has(e.id)).map(e=>({source:e,ids:n.get(e.id)}))}function tr(e,t){return t.filter(t=>$n(e,t)===null)}function nr(e,t){let n=Yn(new Bt,t.features,t.transform,t.primitives),r=Qn(t.ops,t.stock);return{startA:t.startA,stock:t.stock,geometry:e,features:t.features,transform:t.transform,tools:t.tools,primitives:t.primitives,sources:r?[...n,r]:n,datumAngle:t.datumAngle,prevRpm:t.prevRpm,standing:t.standing}}let rr=6.6,ir=rr*360;function ar(e,t){let n=((e-t)%360+360)%360;return n>180&&(n-=360),n}function or(e,t,n){let r=Math.abs(t-e),i=Math.floor(r/n),a=[];for(let o=0;o<=i;o++)a.push(e+(t-e)*(o*n/r));return Math.abs(a[a.length-1]-t)>1e-9&&a.push(t),a}function sr(e,t,n,r=0){if(e.targetDiameter<=0)throw Error(`targetDiameter must be positive`);if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.stepOver<=0)throw Error(`stepOver must be positive`);if(e.finishAllowance<0)throw Error(`finishAllowance must be >= 0`);if(e.feed<=0)throw Error(`feed must be positive`);if(n.diameter<=0)throw Error(`tool diameter must be positive`);if(e.pattern!==`vertical`&&e.pattern!==`horizontal`&&e.pattern!==`spiral`)throw Error(`unknown face pattern ${String(e.pattern)}`);let{axisZ:i,effectiveRadius:a}=t,o=a-e.targetDiameter/2;if(o<=0)throw Error(`target diameter ${e.targetDiameter} is not below stock radius ${a} — nothing to face`);if(Math.abs(e.xEnd-e.xStart)<=0)throw Error(`xStart and xEnd must differ`);let s=n.diameter/2,c=e.cutBeyondStock?e.xStart:Math.min(e.xStart+s,e.xEnd-s),l=e.cutBeyondStock?e.xEnd:Math.max(e.xEnd-s,c),u=Math.abs(l-c),d=Math.max(o-e.finishAllowance,0),f=[];if(d>0){let t=Math.ceil(d/e.stepDown);for(let e=1;e<t;e++)f.push(e*d/t);f.push(d)}let p=[];if(e.finishAllowance>1e-9){let t=Math.ceil(e.finishAllowance/e.stepDown);for(let n=1;n<t;n++)p.push(d+n*e.finishAllowance/t);p.push(o)}let m=e.finishingOnly?[o]:[...f,...p],h=e.stepOver,g=u/h,_=g*360,v=g/rr,y=e.rotation===`cw`?1:-1,b=1/rr,x=i+a,S=x+(e.clearance??5),C=[],w=r,T=0,E=0,D=or(c,l,h),O=!e.cutBeyondStock;return m.forEach((t,n)=>{let r=n===m.length-1,i=t-(n===0?0:m[n-1]),o=x-t,s=Math.max(i/e.plungeFeed,90/360/rr),d=`pass ${n+1}/${m.length}${r?` (finish)`:``} depth ${t.toFixed(3)}mm radial`;if(e.pattern===`spiral`){let u=n%2==0?c:l,f=n%2==0?l:c;n===0&&(C.push({words:{x:u},feed:0,rapid:!0,comment:d}),C.push({words:{z:S},feed:0,rapid:!0})),O&&(C.push({words:{z:o},feed:e.plungeFeed,comment:`plunge ${i.toFixed(3)}mm radial`}),w+=y*360,C.push({words:{a:w},feed:ir,comment:`entry ring 360° at X${u.toFixed(1)} — squaring the edge`}),T+=i/e.plungeFeed+b),w+=y*90,C.push({words:{z:o,a:w},feed:1/s,comment:n===0?`helical entry ${i.toFixed(3)}mm radial`:`spiral step down ${i.toFixed(3)}mm radial`});let p=n%2==0;w+=p?y*_:-y*_,C.push({words:{x:f,a:w},feed:1/v,comment:r?void 0:`rough to r=${(a-t).toFixed(3)}`}),O&&(w+=y*360,C.push({words:{a:w},feed:ir,comment:`exit ring 360° at X${f.toFixed(1)} — squaring the edge`}),T+=b),r&&C.push({words:{z:S},feed:0,rapid:!0}),T+=s+v}else if(e.pattern===`vertical`){let t=n%2==0?D:[...D].reverse();n===0&&(C.push({words:{x:t[0]},feed:0,rapid:!0,comment:`${d} — ${t.length} rings`}),C.push({words:{z:S},feed:0,rapid:!0})),C.push({words:{z:o},feed:e.plungeFeed,comment:`plunge ${i.toFixed(3)}mm radial`}),t.forEach((n,r)=>{w+=y*360,C.push({words:{a:w},feed:ir}),r<t.length-1&&C.push({words:{x:t[r+1]},feed:e.feed})}),r&&C.push({words:{z:S},feed:0,rapid:!0}),T+=i/e.plungeFeed+t.length/rr+u/e.feed}else{let n=e.stepOver/(a-t)*(180/Math.PI),s=Math.ceil(360/n);for(let f=0;f<s;f++){let p=E%2==0,m=p?c:l,h=p?l:c;C.push({words:{a:w},feed:0,rapid:!0,comment:f===0?`${d} — ${s} indexed passes`:void 0}),C.push({words:{x:m},feed:0,rapid:!0}),E===0&&C.push({words:{z:S},feed:0,rapid:!0}),C.push({words:{z:o},feed:e.plungeFeed,comment:`plunge ${i.toFixed(3)}mm radial`}),C.push({words:{x:h},feed:e.feed,comment:r?void 0:`rough to r=${(a-t).toFixed(3)}`}),C.push({words:{z:S},feed:0,rapid:!0}),T+=i/e.plungeFeed+u/e.feed,w+=y*n,E++}}}),{moves:C,passes:m.length,radialDepth:o,estimatedMinutes:T}}function cr(e,t,n){let r=e-t;if(r<=n+1e-9)return[t];let i=Math.ceil(r/n),a=[];for(let t=1;t<i;t++)a.push(e-t*r/i);return a.push(t),a}function lr(e,t,n,r=0){if(e.edges.length===0)throw Error(`cylinder chamfer needs at least one edge circle`);if(e.depth<0)throw Error(`chamfer depth cannot be negative`);if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.plungeFeed<=0)throw Error(`plungeFeed must be positive`);if(n.type!==`vbit`)throw Error(`cylinder chamfer needs a V-bit — pick a chamfering/engraving bit from the library`);if(n.vAngle===void 0||n.vAngle<=0||n.vAngle>=180)throw Error(`chamfer tool needs a sane included tip angle (0–180°)`);let i=n.vAngle/2*(Math.PI/180),a=(n.tipDiameter??0)/2,o=e.depth*Math.tan(i);if(e.depth>0&&a+o>n.diameter/2+1e-9)throw Error(`chamfer of ${e.depth.toFixed(2)}mm needs ${(a+o).toFixed(2)}mm of flank — the Ø${n.diameter} bit's cone is too short`);let{axisZ:s,effectiveRadius:c}=t,l=s+c+(e.clearance??5),u=e.rotation===`cw`?1:-1,d=e.depth<=1e-9,f=[],p=r,m=0,h=0,g=!1;for(let t of e.edges){if(!(t.diameter>0))throw Error(`edge circle diameter must be positive`);let n=t.diameter/2;if(n>c+1e-6)throw Error(`edge circle Ø${t.diameter.toFixed(2)} is above the stock surface (Ø${(c*2).toFixed(2)}) — nothing to chamfer through`);if(d&&n>=c-1e-6)throw Error(`depth 0 anchors exactly on the circle, but nothing rises above it at the stock surface — set a depth to chamfer down from the rim instead`);let r=n-e.depth;if(r<=.05)throw Error(`chamfer depth ${e.depth}mm at Ø${t.diameter.toFixed(2)} would cut past the axis`);let i=d?c:n,a=cr(i,r,e.stepDown);f.push({words:{x:t.x},feed:0,rapid:!0,comment:`chamfer edge X${t.x.toFixed(2)}, Ø${t.diameter.toFixed(2)} — `+(d?`cut up-and-out`:`${e.depth.toFixed(2)}mm below`)}),g||=(f.push({words:{z:l},feed:0,rapid:!0}),!0);let o=i;a.forEach((t,n)=>{f.push({words:{z:s+t},feed:e.plungeFeed,comment:n===a.length-1?void 0:`level ${n+1}/${a.length}`}),m+=Math.max(o-t,0)/e.plungeFeed,o=t,p+=u*360,f.push({words:{a:p},feed:ir}),m+=1/rr,h++}),f.push({words:{z:l},feed:0,rapid:!0})}return{moves:f,passes:h,chamferAngleDeg:90-n.vAngle/2,width:o,estimatedMinutes:m}}function ur(e,t){let n=Math.ceil(e/t),r=[];for(let t=1;t<n;t++)r.push(t*e/n);return r.push(e),r}function dr(e){if(e.paths.length===0)throw Error(`engrave needs at least one path`);if(e.paths.forEach((e,t)=>{if(e.length<2)throw Error(`path ${t+1} needs at least two points`)}),e.feed<=0)throw Error(`feed must be positive`);if(e.laser)return fr(e);if(e.depth<=0)throw Error(`depth must be positive`);if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.plungeFeed<=0)throw Error(`plungeFeed must be positive`);let t=e.frame.kind===`wrapped`,n=t?e.frame.radius:0;if(t&&n<=0)throw Error(`radius must be positive`);let r=t?180/(Math.PI*n):0,i=e.frame.surfaceZ+e.clearance,a=ur(e.depth,e.stepDown),o=[],s=0,c=e.feed,l=t?e.frame.startA:0,u=!1,d=()=>{u||=(o.push({words:{z:i},feed:0,rapid:!0}),!0)};for(let f of e.paths){if(t){let t=e.frame;l+=ar(t.datumAngle+f[0].x*r,l),o.push({words:{a:l},feed:0,rapid:!0,comment:`path start, A${l.toFixed(2)}`}),o.push({words:{x:f[0].y},feed:0,rapid:!0}),d()}else o.push({words:{x:f[0].x,y:f[0].y},feed:0,rapid:!0}),d();a.forEach((i,u)=>{let d=e.frame.surfaceZ-i,p=u===0?i:i-a[u-1];o.push({words:{z:d},feed:e.plungeFeed,comment:u===0?`plunge to ${i.toFixed(2)}mm deep`:`level ${u+1}/${a.length}`}),s+=p/e.plungeFeed;let m=u%2==0,h=f.length,g=e=>m?e:h-1-e;for(let a=0;a<h-1;a++){let u=f[g(a)],d=f[g(a+1)];if(t){let t=(d.x-u.x)*r,a=d.y-u.y,f=n-i,p=Math.hypot(f/n*(d.x-u.x),a);if(Math.abs(t)<1e-12&&Math.abs(a)<1e-12)continue;if(l+=t,Math.abs(t)<1e-12)o.push({words:{x:d.y},feed:e.feed}),s+=Math.abs(a)/e.feed;else if(Math.abs(a)<1e-12)o.push({words:{a:l},feed:ir}),s+=Math.abs(t)/ir,c=Math.min(c,p/(Math.abs(t)/ir));else{let n=Math.max(p/e.feed,Math.abs(t)/360/rr);o.push({words:{x:d.y,a:l},feed:1/n}),s+=n,c=Math.min(c,p/n)}}else{let t=Math.hypot(d.x-u.x,d.y-u.y);if(t<1e-12)continue;o.push({words:{x:d.x,y:d.y},feed:e.feed}),s+=t/e.feed}}}),o.push({words:{z:i},feed:0,rapid:!0}),u=!0}return{moves:o,estimatedMinutes:s,effectiveFeed:c}}function fr(e){let{focus:t,power:n}=e.laser;if(t<0)throw Error(`laser focus must not be negative`);if(n<=0||n>1)throw Error(`laser power must be within (0, 1]`);let r=e.frame.kind===`wrapped`,i=r?e.frame.radius:0;if(r&&i<=0)throw Error(`radius must be positive`);let a=r?180/(Math.PI*i):0,o=e.frame.surfaceZ+t,s=[],c=0,l=e.feed,u=r?e.frame.startA:0;return e.paths.forEach((t,i)=>{if(i>0&&s.push({words:{},feed:e.feed,power:0}),r){let n=e.frame;u+=ar(n.datumAngle+t[0].x*a,u),s.push({words:{a:u},feed:0,rapid:!0}),s.push({words:{x:t[0].y},feed:0,rapid:!0})}else s.push({words:{x:t[0].x,y:t[0].y},feed:0,rapid:!0});i===0&&s.push({words:{z:o},feed:0,rapid:!0,comment:`laser focus height`});let d=!0;for(let i=0;i<t.length-1;i++){let o=t[i],f=t[i+1];if(r){let t=(f.x-o.x)*a,r=f.y-o.y,i=Math.hypot(f.x-o.x,f.y-o.y);if(Math.abs(t)<1e-12&&Math.abs(r)<1e-12)continue;u+=t;let p=d?{power:n}:{};if(Math.abs(t)<1e-12)s.push({words:{x:f.y},feed:e.feed,...p}),c+=Math.abs(r)/e.feed;else if(Math.abs(r)<1e-12)s.push({words:{a:u},feed:ir,...p}),c+=Math.abs(t)/ir,l=Math.min(l,i/(Math.abs(t)/ir));else{let n=Math.max(i/e.feed,Math.abs(t)/360/rr);s.push({words:{x:f.y,a:u},feed:1/n,...p}),c+=n,l=Math.min(l,i/n)}}else{let t=Math.hypot(f.x-o.x,f.y-o.y);if(t<1e-12)continue;s.push({words:{x:f.x,y:f.y},feed:e.feed,...d?{power:n}:{}}),c+=t/e.feed}d=!1}}),s.push({words:{},feed:e.feed,power:0}),{moves:s,estimatedMinutes:c,effectiveFeed:l}}function pr(e,t){if(e<=t)return[0];let n=Math.ceil(e/t),r=e-t;return Array.from({length:n},(e,t)=>-r/2+t*r/(n-1))}function mr(e,t){let n=Math.ceil(e/t),r=[];for(let t=1;t<n;t++)r.push(t*e/n);return r.push(e),r}function hr(e,t,n){return n>=90-1e-9?0:e/(2*Math.PI*t*Math.tan(n*Math.PI/180))*360}function gr(e,t,n,r,i=0){if(e.xEnd===e.xStart)throw Error(`xStart and xEnd must differ`);if(e.spiralAngle<=0||e.spiralAngle>90)throw Error(`spiral angle must be within (0°, 90°]`);if(!Number.isInteger(e.count)||e.count<1)throw Error(`count must be a whole number ≥ 1`);if(e.depth<=0)throw Error(`depth must be positive`);if(e.width<0)throw Error(`width cannot be negative (0 = just follow the lines)`);if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(n<=0)throw Error(`tool diameter must be positive`);if(e.plungeFeed<=0)throw Error(`plungeFeed must be positive`);let{axisZ:a,effectiveRadius:o}=t,s=e.surfaceDiameter/2;if(s>o+1e-9)throw Error(`surface Ø ${e.surfaceDiameter} is above the stock radius ${o} — carve into the stock, not above it`);if(e.depth>=s-.05)throw Error(`groove depth ${e.depth}mm leaves no material at Ø${e.surfaceDiameter} — the cut would reach past the axis`);let c=Math.abs(e.xEnd-e.xStart),l=a+s,u=l+(e.clearance??5),d=hr(c,s,e.spiralAngle),f=e.rotation===`cw`?1:-1,p=d>1e-9,m=d/360,h=t=>p?Math.max(Math.hypot(d*Math.PI/180*(s-t),c)/e.feed,m/rr):c/e.feed,g=mr(e.depth,e.stepDown),_=pr(e.width,n),v=[],y=i,b=0,x=0,S=!1;for(let t=0;t<e.count;t++){let n=r+(e.spin??0)+t*(360/e.count);y+=ar(n,y);for(let n of _){let r=e.xStart+n,i=e.xEnd+n;v.push({words:{a:y},feed:0,rapid:!0,comment:`strand ${t+1}/${e.count}${_.length>1?`, pass ${n.toFixed(2)}mm off-center`:``}`}),v.push({words:{x:r},feed:0,rapid:!0}),S||=(v.push({words:{z:u},feed:0,rapid:!0}),!0),g.forEach((t,n)=>{let a=l-t,o=n===0?t:t-g[n-1];v.push({words:{z:a},feed:e.plungeFeed,comment:n===0?`plunge to ${t.toFixed(2)}mm deep`:void 0}),b+=o/e.plungeFeed;let s=n%2==0;y+=s?f*d:-f*d;let c=h(t);v.push({words:p?{x:s?i:r,a:y}:{x:s?i:r},feed:p?1/c:e.feed,comment:n===g.length-1?void 0:`level ${n+1}/${g.length}`}),b+=c,x++}),v.push({words:{z:u},feed:0,rapid:!0})}}return{moves:v,passes:x,estimatedMinutes:b}}function _r(e,t,n){return e/4/Math.tan(t/2*Math.PI/180)+n}function vr(e,t){return e-2*t}function yr(e,t,n,r,i=0){if(e.xEnd===e.xStart)throw Error(`xStart and xEnd must differ`);if(e.pitch<=0)throw Error(`pitch must be positive`);if(!Number.isInteger(e.starts)||e.starts<1)throw Error(`starts must be a whole number ≥ 1`);if(e.tolerance<0)throw Error(`tolerance must be ≥ 0`);if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.feed<=0)throw Error(`feed must be positive`);if(n.type!==`vbit`)throw Error(`threading needs a V-bit tool (chamfering bit)`);if(!n.vAngle||n.vAngle<20||n.vAngle>180)throw Error(`the V-bit has no usable tip angle — set one in the tool library`);let{axisZ:a,effectiveRadius:o}=t,s=_r(e.pitch,n.vAngle,e.tolerance),c=vr(e.nominalDiameter,e.tolerance),l=c/2-s;if(l<=0)throw Error(`the groove depth exceeds the thread radius — nothing would remain`);let u=e.surfaceDiameter===null?o:e.surfaceDiameter/2;if(l>=u)throw Error(`the stock is at or below the thread root — nothing to cut (add the facing toolpath, or check the nominal Ø)`);let d=[],f=0,p=i,m=Math.abs(e.xEnd-e.xStart),h=m/(e.starts*e.pitch)*360,g=h/360,_=t=>Math.max(Math.hypot(h*Math.PI/180*(u-t),m)/e.feed,g/rr),v=e.rotation===`cw`?-1:1,y=a+u+(e.clearance??5),b=u-l,x=Math.ceil(b/e.stepDown),S=[];for(let e=1;e<x;e++)S.push(e*b/x);S.push(b);let C=0,w=a+u;for(let t=0;t<e.starts;t++){let n=r+t*(360/e.starts);p+=ar(n,p),d.push({words:{a:p},feed:0,rapid:!0,comment:`start ${t+1}/${e.starts}`}),d.push({words:{x:e.xStart},feed:0,rapid:!0}),t===0&&d.push({words:{z:y},feed:0,rapid:!0});let i=[...S,b];i.forEach((t,n)=>{let r=w-t,a=n===i.length-1;d.push({words:{z:r},feed:e.plungeFeed,comment:n===0?`plunge to thread depth`:void 0}),f+=(n===0?S[0]:t-i[n-1])/e.plungeFeed;let o=n%2==0;p+=o?v*h:-v*h;let s=_(t);d.push({words:{x:o?e.xEnd:e.xStart,a:p},feed:1/s,comment:a?`spring pass`:void 0}),f+=s,C++}),d.push({words:{z:y},feed:0,rapid:!0})}return{moves:d,passes:C,estimatedMinutes:f,depth:s,faceDiameter:c}}let br=.5;function xr(e,t,n){let r=e-t;if(r<=0)return[t];let i=Math.ceil(r/n),a=[];for(let t=1;t<i;t++)a.push(e-t*r/i);return a.push(t),a}function Sr(e,t){if(!t||e.length===0)return e;let n=0,r=1/0;for(let i=0;i<e.length;i++){let a=(e[i].x-t.x)**2+(e[i].y-t.y)**2;a<r&&(r=a,n=i)}return[...e.slice(n),...e.slice(0,n)]}function Cr(e,t,n){let r=n.x-t.x,i=n.y-t.y,a=r*r+i*i;if(a===0)return Math.hypot(e.x-t.x,e.y-t.y);let o=((e.x-t.x)*r+(e.y-t.y)*i)/a,s=o<0?0:o>1?1:o;return Math.hypot(e.x-(t.x+s*r),e.y-(t.y+s*i))}function wr(e,t){let n=e.length;if(n<3)return e.slice();let r=t=>{let r=0,i=-1;for(let a=0;a<n;a++){let n=(e[a].x-t.x)**2+(e[a].y-t.y)**2;n>i&&(i=n,r=a)}return r},i=r(e[0]),a=r(e[i]),o=new Uint8Array(n),s=(r,i)=>{o[r]=1,o[i]=1;let a=(i-r+n)%n+1;if(a<=2)return;let s=e=>(r+e)%n,c=[[0,a-1]];for(;c.length>0;){let[n,r]=c.pop(),i=e[s(n)],a=e[s(r)],l=-1,u=-1;for(let t=n+1;t<r;t++){let n=Cr(e[s(t)],i,a);n>l&&(l=n,u=t)}l>t&&(o[s(u)]=1,c.push([n,u],[u,r]))}};s(a,i),s(i,a);let c=[];for(let t=0;t<n;t++){let r=(a+t)%n;o[r]&&c.push(e[r])}return c.length>=3?c:e.slice()}function Tr(e,t){return e-1.2268*t}function Er(e){return e.flutes===void 0||e.flutes>=2}function Dr(e,t){return e-1.0825*t}function Or(e,t,n,r,i){return i?e/2+r-n:Tr(e,t)/2+n-r}function kr(e){return Math.min(512,Math.max(64,Math.ceil(2*Math.PI*e/.15)))}function Ar(e,t){if(e.targets.length===0)throw Error(`thread milling needs at least one target`);if(t.type!==`threadmill`)throw Error(`thread milling needs a thread mill — pick one from the tool library`);if(!(t.diameter>0))throw Error(`the thread mill has no cutting diameter set`);if(Er(t)){if(t.pitch===void 0)throw Error(`the ${t.name} is a multi-tooth mill with no pitch set — its teeth only align at one fixed pitch; set the pitch in the library`);if(Math.abs(t.pitch-e.pitch)>1e-9)throw Error(`the ${t.name} mills a ${t.pitch}mm pitch — this op wants ${e.pitch}mm; pick the matching thread mill (a multi-tooth mill cannot cut another pitch)`)}if(!(e.pitch>0))throw Error(`pitch must be positive`);if(!Number.isInteger(e.starts)||e.starts<1)throw Error(`starts must be a whole number ≥ 1`);if(e.tolerance<0)throw Error(`tolerance must be ≥ 0`);for(let t of e.targets)if(!(t.depth>0))throw Error(`each target needs a positive thread depth`);if(!(e.feed>0))throw Error(`feed must be positive`);if(!(e.plungeFeed>0))throw Error(`plunge feed must be positive`);if(!(e.safeClearance>0))throw Error(`safe clearance must be positive`);let n=t.diameter/2,r=e.starts*e.pitch,i=e.rotation===`ccw`?-1:1,a=Math.max(...e.targets.map(e=>e.topZ))+e.safeClearance,o=[],s=0,c=0,l=[],u=null;return e.targets.forEach((d,f)=>{let p=d.internal?d.boreRadius&&d.boreRadius>0?d.boreRadius:Dr(e.nominalDiameter,e.pitch)/2:0;if(d.internal){if(n>=p)throw Error(`the Ø${t.diameter} mill does not fit the Ø${(p*2).toFixed(2)} bore — prep a larger bore or a slimmer mill`);let r=t.shaftDiameter??t.diameter,i=t.fluteLength??1/0;if(r>p*2&&d.depth>i-e.pitch)throw Error(`the Ø${r} shank cannot enter the Ø${(p*2).toFixed(2)} bore — this thread is ${d.depth}mm but the ${t.fluteLength}mm cutting length caps it; use a longer-cutting or slimmer mill`)}let m=Or(e.nominalDiameter,e.pitch,n,e.tolerance,d.internal);u===null&&(u=m,l.push(`path radius Rc ${m.toFixed(3)}mm — tips land on the groove bottom (${d.internal?`internal, at the Ø${e.nominalDiameter} major`:`external, at the d3 minor Ø${Tr(e.nominalDiameter,e.pitch).toFixed(3)}`})`));let h=d.topZ-d.depth,g=p-n,_=d.internal&&g<.2;if(d.internal)l.push(_?`Ø${(p*2).toFixed(2)} bore → spiral exit — only ~${g.toFixed(3)}mm of aside room; a straight lift while engaged would drag the tooth through the threads (Alice, 2026-10-28)`:`Ø${(p*2).toFixed(2)} bore → aside retract (${g.toFixed(2)}mm of room)`);else{let n=t.shaftDiameter??t.diameter,r=t.fluteLength??1/0;if(d.depth>r)throw Error(`this ${d.depth}mm thread outruns the ${t.name}'s ${t.fluteLength}mm cutting length — above it the Ø${n} shank sweeps the stock beside the thread; use a longer-cutting mill (or split the thread into Z bands)`);l.push(`Ø${e.nominalDiameter} boss → lifts straight off — nothing stands above an external thread`),e.tolerance>0&&l.push(`the neck shaves the crests ~${e.tolerance.toFixed(2)}mm at this fit — the sim paints a thin red ribbon on the crest tops`)}let v=t.overallLength??1/0;if(d.depth>v-15)throw Error(`this ${d.depth}mm thread is beyond the ${t.name}'s reach — its ${t.overallLength}mm overall length leaves about ${Math.max(0,v-15).toFixed(0)}mm below the collet; use a longer mill`);let y=d.internal?Dr(e.nominalDiameter,e.pitch)/2:e.nominalDiameter/2,b=d.internal?m+n:m-n,x=Math.abs(b-y),S=e.stepOver>0?Math.max(1,Math.ceil(x/e.stepOver)):1;S>1&&l.push(`radial ladder: ${S} levels of ${(x/S).toFixed(3)}mm (step over ${e.stepOver}mm, span ${x.toFixed(3)}mm)`);let C=e=>{let t=e/S,r=d.internal?y+x*t:y-x*t;return d.internal?r-n:r+n},w=(e,t)=>({x:d.center.x+e*Math.cos(t),y:d.center.y+e*Math.sin(t)}),T=d.topZ+e.safeClearance;f>0&&o.push({words:{z:a},feed:0,rapid:!0,comment:`travel clearance`});for(let t=1;t<=S;t++){let n=C(t),a=kr(n),l=w(n+e.safeClearance,0),u=w(n,0),f=t===S?2:1;for(let t=0;t<f;t++){let f=t===1,p=d.internal?d.center:l;o.push({words:{x:p.x,y:p.y},feed:0,rapid:!0,comment:f?`spring pass`:d.internal?`approach at the bore center`:`approach`}),o.push({words:{z:T},feed:0,rapid:!0});for(let t=0;t<e.starts;t++){let c=h+t*e.pitch,f=c+d.depth,p=t===e.starts-1;d.internal?(o.push({words:{z:c+br},feed:0,rapid:!0}),o.push({words:{z:c},feed:e.plungeFeed,comment:`plunge to the thread bottom`}),s+=br/e.plungeFeed):(o.push({words:{z:c},feed:e.plungeFeed,comment:`plunge to the thread bottom`}),s+=(T-c)/e.plungeFeed),o.push({words:{x:u.x,y:u.y},feed:e.feed,comment:`radial entry`}),s+=(d.internal?n:e.safeClearance)/e.feed;let m=d.depth/r,g=Math.max(1,Math.round(m*a)),v=u,y=c;for(let t=1;t<=g;t++){let r=t/g,a=i*2*Math.PI*m*r,l=c+d.depth*r,u=w(n,a);o.push({words:{x:u.x,y:u.y,z:l},feed:e.feed}),s+=Math.hypot(u.x-v.x,u.y-v.y,l-y)/e.feed,v=u,y=l}if(d.internal){if(_){let c=Math.min(1,(e.pitch+.5)/r),l=Math.max(1,Math.round(c*a));for(let t=1;t<=l;t++){let a=t/l,u=i*2*Math.PI*(m+c*a),d=f+c*r*a,p=w(n,u);o.push({words:{x:p.x,y:p.y,z:d},feed:e.feed}),s+=Math.hypot(p.x-v.x,p.y-v.y,d-y)/e.feed,v=p,y=d}let u=f+c*r;o.push({words:{z:Math.max(T,u)},feed:0,rapid:!0}),p||o.push({words:{x:d.center.x,y:d.center.y},feed:0,rapid:!0,comment:`re-entering for start ${t+2}/${e.starts}`})}else o.push({words:{x:d.center.x,y:d.center.y},feed:e.feed,comment:p?`aside retract`:`step aside for the next start`}),s+=n/e.feed,o.push({words:{z:T},feed:0,rapid:!0})}else o.push({words:{z:T},feed:0,rapid:!0}),p||o.push({words:{x:l.x,y:l.y},feed:0,rapid:!0,comment:`re-entering for start ${t+2}/${e.starts}`})}c++}}}),{moves:o,passes:c,estimatedMinutes:s,pathRadius:u??0,notes:l}}var G=(/* @__PURE__ */ e(((e,t)=>{(function(){"use strict";var e={};e.version=`6.4.2.2`,e.use_lines=!0,e.use_xyz=!1;var n=!1;t!==void 0&&t.exports?(t.exports=e,n=!0):(typeof define==`function`&&define.amd&&define(e),typeof document<`u`?window.ClipperLib=e:self.ClipperLib=e);var r;if(n){var i=`chrome`;r=`Netscape`}else{var i=navigator.userAgent.toString().toLowerCase();r=navigator.appName}var a={};a.chrome=+(i.indexOf(`chrome`)!=-1&&i.indexOf(`chromium`)==-1),a.chromium=i.indexOf(`chromium`)==-1?0:1,a.safari=+(i.indexOf(`safari`)!=-1&&i.indexOf(`chrome`)==-1&&i.indexOf(`chromium`)==-1),a.firefox=i.indexOf(`firefox`)==-1?0:1,a.firefox17=i.indexOf(`firefox/17`)==-1?0:1,a.firefox15=i.indexOf(`firefox/15`)==-1?0:1,a.firefox3=i.indexOf(`firefox/3`)==-1?0:1,a.opera=i.indexOf(`opera`)==-1?0:1,a.msie10=i.indexOf(`msie 10`)==-1?0:1,a.msie9=i.indexOf(`msie 9`)==-1?0:1,a.msie8=i.indexOf(`msie 8`)==-1?0:1,a.msie7=i.indexOf(`msie 7`)==-1?0:1,a.msie=i.indexOf(`msie `)==-1?0:1,e.biginteger_used=null;var o,s=!0;function c(t,n,r){e.biginteger_used=1,t!=null&&(typeof t==`number`&&n===void 0?this.fromInt(t):typeof t==`number`?this.fromNumber(t,n,r):n==null&&typeof t!=`string`?this.fromString(t,256):this.fromString(t,n))}function l(){return new c(null,void 0,void 0)}function u(e,t,n,r,i,a){for(;--a>=0;){var o=t*this[e++]+n[r]+i;i=Math.floor(o/67108864),n[r++]=o&67108863}return i}function d(e,t,n,r,i,a){for(var o=t&32767,s=t>>15;--a>=0;){var c=this[e]&32767,l=this[e++]>>15,u=s*c+l*o;c=o*c+((u&32767)<<15)+n[r]+(i&1073741823),i=(c>>>30)+(u>>>15)+s*l+(i>>>30),n[r++]=c&1073741823}return i}function f(e,t,n,r,i,a){for(var o=t&16383,s=t>>14;--a>=0;){var c=this[e]&16383,l=this[e++]>>14,u=s*c+l*o;c=o*c+((u&16383)<<14)+n[r]+i,i=(c>>28)+(u>>14)+s*l,n[r++]=c&268435455}return i}s&&r==`Microsoft Internet Explorer`?(c.prototype.am=d,o=30):s&&r!=`Netscape`?(c.prototype.am=u,o=26):(c.prototype.am=f,o=28),c.prototype.DB=o,c.prototype.DM=(1<<o)-1,c.prototype.DV=1<<o;var p=52;c.prototype.FV=2**p,c.prototype.F1=p-o,c.prototype.F2=2*o-p;for(var m=`0123456789abcdefghijklmnopqrstuvwxyz`,h=[],g=48,_=0;_<=9;++_)h[g++]=_;for(g=97,_=10;_<36;++_)h[g++]=_;for(g=65,_=10;_<36;++_)h[g++]=_;function v(e){return m.charAt(e)}function y(e,t){return h[e.charCodeAt(t)]??-1}function b(e){for(var t=this.t-1;t>=0;--t)e[t]=this[t];e.t=this.t,e.s=this.s}function x(e){this.t=1,this.s=e<0?-1:0,e>0?this[0]=e:e<-1?this[0]=e+this.DV:this.t=0}function S(e){var t=l();return t.fromInt(e),t}function C(e,t){var n;if(t==16)n=4;else if(t==8)n=3;else if(t==256)n=8;else if(t==2)n=1;else if(t==32)n=5;else if(t==4)n=2;else{this.fromRadix(e,t);return}this.t=0,this.s=0;for(var r=e.length,i=!1,a=0;--r>=0;){var o=n==8?e[r]&255:y(e,r);o<0?e.charAt(r)==`-`&&(i=!0):(i=!1,a==0?this[this.t++]=o:a+n>this.DB?(this[this.t-1]|=(o&(1<<this.DB-a)-1)<<a,this[this.t++]=o>>this.DB-a):this[this.t-1]|=o<<a,a+=n,a>=this.DB&&(a-=this.DB))}n==8&&e[0]&128&&(this.s=-1,a>0&&(this[this.t-1]|=(1<<this.DB-a)-1<<a)),this.clamp(),i&&c.ZERO.subTo(this,this)}function w(){for(var e=this.s&this.DM;this.t>0&&this[this.t-1]==e;)--this.t}function T(e){if(this.s<0)return`-`+this.negate().toString(e);var t;if(e==16)t=4;else if(e==8)t=3;else if(e==2)t=1;else if(e==32)t=5;else if(e==4)t=2;else return this.toRadix(e);var n=(1<<t)-1,r,i=!1,a=``,o=this.t,s=this.DB-o*this.DB%t;if(o-->0)for(s<this.DB&&(r=this[o]>>s)>0&&(i=!0,a=v(r));o>=0;)s<t?(r=(this[o]&(1<<s)-1)<<t-s,r|=this[--o]>>(s+=this.DB-t)):(r=this[o]>>(s-=t)&n,s<=0&&(s+=this.DB,--o)),r>0&&(i=!0),i&&(a+=v(r));return i?a:`0`}function E(){var e=l();return c.ZERO.subTo(this,e),e}function D(){return this.s<0?this.negate():this}function O(e){var t=this.s-e.s;if(t!=0)return t;var n=this.t;if(t=n-e.t,t!=0)return this.s<0?-t:t;for(;--n>=0;)if((t=this[n]-e[n])!=0)return t;return 0}function k(e){var t=1,n;return(n=e>>>16)!=0&&(e=n,t+=16),(n=e>>8)!=0&&(e=n,t+=8),(n=e>>4)!=0&&(e=n,t+=4),(n=e>>2)!=0&&(e=n,t+=2),(n=e>>1)!=0&&(e=n,t+=1),t}function ee(){return this.t<=0?0:this.DB*(this.t-1)+k(this[this.t-1]^this.s&this.DM)}function A(e,t){for(var n=this.t-1;n>=0;--n)t[n+e]=this[n];for(n=e-1;n>=0;--n)t[n]=0;t.t=this.t+e,t.s=this.s}function te(e,t){for(var n=e;n<this.t;++n)t[n-e]=this[n];t.t=Math.max(this.t-e,0),t.s=this.s}function j(e,t){for(var n=e%this.DB,r=this.DB-n,i=(1<<r)-1,a=Math.floor(e/this.DB),o=this.s<<n&this.DM,s=this.t-1;s>=0;--s)t[s+a+1]=this[s]>>r|o,o=(this[s]&i)<<n;for(s=a-1;s>=0;--s)t[s]=0;t[a]=o,t.t=this.t+a+1,t.s=this.s,t.clamp()}function ne(e,t){t.s=this.s;var n=Math.floor(e/this.DB);if(n>=this.t)t.t=0;else{var r=e%this.DB,i=this.DB-r,a=(1<<r)-1;t[0]=this[n]>>r;for(var o=n+1;o<this.t;++o)t[o-n-1]|=(this[o]&a)<<i,t[o-n]=this[o]>>r;r>0&&(t[this.t-n-1]|=(this.s&a)<<i),t.t=this.t-n,t.clamp()}}function M(e,t){for(var n=0,r=0,i=Math.min(e.t,this.t);n<i;)r+=this[n]-e[n],t[n++]=r&this.DM,r>>=this.DB;if(e.t<this.t){for(r-=e.s;n<this.t;)r+=this[n],t[n++]=r&this.DM,r>>=this.DB;r+=this.s}else{for(r+=this.s;n<e.t;)r-=e[n],t[n++]=r&this.DM,r>>=this.DB;r-=e.s}t.s=r<0?-1:0,r<-1?t[n++]=this.DV+r:r>0&&(t[n++]=r),t.t=n,t.clamp()}function re(e,t){var n=this.abs(),r=e.abs(),i=n.t;for(t.t=i+r.t;--i>=0;)t[i]=0;for(i=0;i<r.t;++i)t[i+n.t]=n.am(0,r[i],t,i,0,n.t);t.s=0,t.clamp(),this.s!=e.s&&c.ZERO.subTo(t,t)}function ie(e){for(var t=this.abs(),n=e.t=2*t.t;--n>=0;)e[n]=0;for(n=0;n<t.t-1;++n){var r=t.am(n,t[n],e,2*n,0,1);(e[n+t.t]+=t.am(n+1,2*t[n],e,2*n+1,r,t.t-n-1))>=t.DV&&(e[n+t.t]-=t.DV,e[n+t.t+1]=1)}e.t>0&&(e[e.t-1]+=t.am(n,t[n],e,2*n,0,1)),e.s=0,e.clamp()}function ae(e,t,n){var r=e.abs();if(!(r.t<=0)){var i=this.abs();if(i.t<r.t)t?.fromInt(0),n!=null&&this.copyTo(n);else{n??=l();var a=l(),o=this.s,s=e.s,u=this.DB-k(r[r.t-1]);u>0?(r.lShiftTo(u,a),i.lShiftTo(u,n)):(r.copyTo(a),i.copyTo(n));var d=a.t,f=a[d-1];if(f!=0){var p=f*(1<<this.F1)+(d>1?a[d-2]>>this.F2:0),m=this.FV/p,h=(1<<this.F1)/p,g=1<<this.F2,_=n.t,v=_-d,y=t??l();for(a.dlShiftTo(v,y),n.compareTo(y)>=0&&(n[n.t++]=1,n.subTo(y,n)),c.ONE.dlShiftTo(d,y),y.subTo(a,a);a.t<d;)a[a.t++]=0;for(;--v>=0;){var b=n[--_]==f?this.DM:Math.floor(n[_]*m+(n[_-1]+g)*h);if((n[_]+=a.am(0,b,n,v,0,d))<b)for(a.dlShiftTo(v,y),n.subTo(y,n);n[_]<--b;)n.subTo(y,n)}t!=null&&(n.drShiftTo(d,t),o!=s&&c.ZERO.subTo(t,t)),n.t=d,n.clamp(),u>0&&n.rShiftTo(u,n),o<0&&c.ZERO.subTo(n,n)}}}}function oe(e){var t=l();return this.abs().divRemTo(e,null,t),this.s<0&&t.compareTo(c.ZERO)>0&&e.subTo(t,t),t}function N(e){this.m=e}function se(e){return e.s<0||e.compareTo(this.m)>=0?e.mod(this.m):e}function ce(e){return e}function le(e){e.divRemTo(this.m,null,e)}function P(e,t,n){e.multiplyTo(t,n),this.reduce(n)}function ue(e,t){e.squareTo(t),this.reduce(t)}N.prototype.convert=se,N.prototype.revert=ce,N.prototype.reduce=le,N.prototype.mulTo=P,N.prototype.sqrTo=ue;function de(){if(this.t<1)return 0;var e=this[0];if(!(e&1))return 0;var t=e&3;return t=t*(2-(e&15)*t)&15,t=t*(2-(e&255)*t)&255,t=t*(2-((e&65535)*t&65535))&65535,t=t*(2-e*t%this.DV)%this.DV,t>0?this.DV-t:-t}function F(e){this.m=e,this.mp=e.invDigit(),this.mpl=this.mp&32767,this.mph=this.mp>>15,this.um=(1<<e.DB-15)-1,this.mt2=2*e.t}function fe(e){var t=l();return e.abs().dlShiftTo(this.m.t,t),t.divRemTo(this.m,null,t),e.s<0&&t.compareTo(c.ZERO)>0&&this.m.subTo(t,t),t}function pe(e){var t=l();return e.copyTo(t),this.reduce(t),t}function me(e){for(;e.t<=this.mt2;)e[e.t++]=0;for(var t=0;t<this.m.t;++t){var n=e[t]&32767,r=n*this.mpl+((n*this.mph+(e[t]>>15)*this.mpl&this.um)<<15)&e.DM;for(n=t+this.m.t,e[n]+=this.m.am(0,r,e,t,0,this.m.t);e[n]>=e.DV;)e[n]-=e.DV,e[++n]++}e.clamp(),e.drShiftTo(this.m.t,e),e.compareTo(this.m)>=0&&e.subTo(this.m,e)}function he(e,t){e.squareTo(t),this.reduce(t)}function ge(e,t,n){e.multiplyTo(t,n),this.reduce(n)}F.prototype.convert=fe,F.prototype.revert=pe,F.prototype.reduce=me,F.prototype.mulTo=ge,F.prototype.sqrTo=he;function _e(){return(this.t>0?this[0]&1:this.s)==0}function I(e,t){if(e>4294967295||e<1)return c.ONE;var n=l(),r=l(),i=t.convert(this),a=k(e)-1;for(i.copyTo(n);--a>=0;)if(t.sqrTo(n,r),(e&1<<a)>0)t.mulTo(r,i,n);else{var o=n;n=r,r=o}return t.revert(n)}function ve(e,t){var n=e<256||t.isEven()?new N(t):new F(t);return this.exp(e,n)}c.prototype.copyTo=b,c.prototype.fromInt=x,c.prototype.fromString=C,c.prototype.clamp=w,c.prototype.dlShiftTo=A,c.prototype.drShiftTo=te,c.prototype.lShiftTo=j,c.prototype.rShiftTo=ne,c.prototype.subTo=M,c.prototype.multiplyTo=re,c.prototype.squareTo=ie,c.prototype.divRemTo=ae,c.prototype.invDigit=de,c.prototype.isEven=_e,c.prototype.exp=I,c.prototype.toString=T,c.prototype.negate=E,c.prototype.abs=D,c.prototype.compareTo=O,c.prototype.bitLength=ee,c.prototype.mod=oe,c.prototype.modPowInt=ve,c.ZERO=S(0),c.ONE=S(1);function ye(){var e=l();return this.copyTo(e),e}function be(){if(this.s<0){if(this.t==1)return this[0]-this.DV;if(this.t==0)return-1}else if(this.t==1)return this[0];else if(this.t==0)return 0;return(this[1]&(1<<32-this.DB)-1)<<this.DB|this[0]}function xe(){return this.t==0?this.s:this[0]<<24>>24}function Se(){return this.t==0?this.s:this[0]<<16>>16}function Ce(e){return Math.floor(Math.LN2*this.DB/Math.log(e))}function we(){return this.s<0?-1:this.t<=0||this.t==1&&this[0]<=0?0:1}function Te(e){if(e??=10,this.signum()==0||e<2||e>36)return`0`;var t=this.chunkSize(e),n=e**+t,r=S(n),i=l(),a=l(),o=``;for(this.divRemTo(r,i,a);i.signum()>0;)o=(n+a.intValue()).toString(e).substr(1)+o,i.divRemTo(r,i,a);return a.intValue().toString(e)+o}function Ee(e,t){this.fromInt(0),t??=10;for(var n=this.chunkSize(t),r=t**+n,i=!1,a=0,o=0,s=0;s<e.length;++s){var l=y(e,s);l<0?e.charAt(s)==`-`&&this.signum()==0&&(i=!0):(o=t*o+l,++a>=n&&(this.dMultiply(r),this.dAddOffset(o,0),a=0,o=0))}a>0&&(this.dMultiply(t**+a),this.dAddOffset(o,0)),i&&c.ZERO.subTo(this,this)}function De(e,t,n){if(typeof t==`number`){if(e<2)this.fromInt(1);else for(this.fromNumber(e,n),this.testBit(e-1)||this.bitwiseTo(c.ONE.shiftLeft(e-1),Fe,this),this.isEven()&&this.dAddOffset(1,0);!this.isProbablePrime(t);)this.dAddOffset(2,0),this.bitLength()>e&&this.subTo(c.ONE.shiftLeft(e-1),this)}else{var r=[],i=e&7;r.length=(e>>3)+1,t.nextBytes(r),i>0?r[0]&=(1<<i)-1:r[0]=0,this.fromString(r,256)}}function Oe(){var e=this.t,t=[];t[0]=this.s;var n=this.DB-e*this.DB%8,r,i=0;if(e-->0)for(n<this.DB&&(r=this[e]>>n)!=(this.s&this.DM)>>n&&(t[i++]=r|this.s<<this.DB-n);e>=0;)n<8?(r=(this[e]&(1<<n)-1)<<8-n,r|=this[--e]>>(n+=this.DB-8)):(r=this[e]>>(n-=8)&255,n<=0&&(n+=this.DB,--e)),r&128&&(r|=-256),i==0&&(this.s&128)!=(r&128)&&++i,(i>0||r!=this.s)&&(t[i++]=r);return t}function ke(e){return this.compareTo(e)==0}function Ae(e){return this.compareTo(e)<0?this:e}function je(e){return this.compareTo(e)>0?this:e}function Me(e,t,n){var r,i,a=Math.min(e.t,this.t);for(r=0;r<a;++r)n[r]=t(this[r],e[r]);if(e.t<this.t){for(i=e.s&this.DM,r=a;r<this.t;++r)n[r]=t(this[r],i);n.t=this.t}else{for(i=this.s&this.DM,r=a;r<e.t;++r)n[r]=t(i,e[r]);n.t=e.t}n.s=t(this.s,e.s),n.clamp()}function Ne(e,t){return e&t}function Pe(e){var t=l();return this.bitwiseTo(e,Ne,t),t}function Fe(e,t){return e|t}function Ie(e){var t=l();return this.bitwiseTo(e,Fe,t),t}function Le(e,t){return e^t}function Re(e){var t=l();return this.bitwiseTo(e,Le,t),t}function ze(e,t){return e&~t}function Be(e){var t=l();return this.bitwiseTo(e,ze,t),t}function Ve(){for(var e=l(),t=0;t<this.t;++t)e[t]=this.DM&~this[t];return e.t=this.t,e.s=~this.s,e}function He(e){var t=l();return e<0?this.rShiftTo(-e,t):this.lShiftTo(e,t),t}function Ue(e){var t=l();return e<0?this.lShiftTo(-e,t):this.rShiftTo(e,t),t}function We(e){if(e==0)return-1;var t=0;return e&65535||(e>>=16,t+=16),e&255||(e>>=8,t+=8),e&15||(e>>=4,t+=4),e&3||(e>>=2,t+=2),e&1||++t,t}function Ge(){for(var e=0;e<this.t;++e)if(this[e]!=0)return e*this.DB+We(this[e]);return this.s<0?this.t*this.DB:-1}function Ke(e){for(var t=0;e!=0;)e&=e-1,++t;return t}function qe(){for(var e=0,t=this.s&this.DM,n=0;n<this.t;++n)e+=Ke(this[n]^t);return e}function Je(e){var t=Math.floor(e/this.DB);return t>=this.t?this.s!=0:!!(this[t]&1<<e%this.DB)}function Ye(e,t){var n=c.ONE.shiftLeft(e);return this.bitwiseTo(n,t,n),n}function Xe(e){return this.changeBit(e,Fe)}function Ze(e){return this.changeBit(e,ze)}function Qe(e){return this.changeBit(e,Le)}function $e(e,t){for(var n=0,r=0,i=Math.min(e.t,this.t);n<i;)r+=this[n]+e[n],t[n++]=r&this.DM,r>>=this.DB;if(e.t<this.t){for(r+=e.s;n<this.t;)r+=this[n],t[n++]=r&this.DM,r>>=this.DB;r+=this.s}else{for(r+=this.s;n<e.t;)r+=e[n],t[n++]=r&this.DM,r>>=this.DB;r+=e.s}t.s=r<0?-1:0,r>0?t[n++]=r:r<-1&&(t[n++]=this.DV+r),t.t=n,t.clamp()}function et(e){var t=l();return this.addTo(e,t),t}function tt(e){var t=l();return this.subTo(e,t),t}function nt(e){var t=l();return this.multiplyTo(e,t),t}function rt(){var e=l();return this.squareTo(e),e}function it(e){var t=l();return this.divRemTo(e,t,null),t}function at(e){var t=l();return this.divRemTo(e,null,t),t}function ot(e){var t=l(),n=l();return this.divRemTo(e,t,n),[t,n]}function st(e){this[this.t]=this.am(0,e-1,this,0,0,this.t),++this.t,this.clamp()}function ct(e,t){if(e!=0){for(;this.t<=t;)this[this.t++]=0;for(this[t]+=e;this[t]>=this.DV;)this[t]-=this.DV,++t>=this.t&&(this[this.t++]=0),++this[t]}}function lt(){}function ut(e){return e}function dt(e,t,n){e.multiplyTo(t,n)}function ft(e,t){e.squareTo(t)}lt.prototype.convert=ut,lt.prototype.revert=ut,lt.prototype.mulTo=dt,lt.prototype.sqrTo=ft;function pt(e){return this.exp(e,new lt)}function mt(e,t,n){var r=Math.min(this.t+e.t,t);for(n.s=0,n.t=r;r>0;)n[--r]=0;for(var i=n.t-this.t;r<i;++r)n[r+this.t]=this.am(0,e[r],n,r,0,this.t);for(i=Math.min(e.t,t);r<i;++r)this.am(0,e[r],n,r,0,t-r);n.clamp()}function ht(e,t,n){--t;var r=n.t=this.t+e.t-t;for(n.s=0;--r>=0;)n[r]=0;for(r=Math.max(t-this.t,0);r<e.t;++r)n[this.t+r-t]=this.am(t-r,e[r],n,0,0,this.t+r-t);n.clamp(),n.drShiftTo(1,n)}function gt(e){this.r2=l(),this.q3=l(),c.ONE.dlShiftTo(2*e.t,this.r2),this.mu=this.r2.divide(e),this.m=e}function _t(e){if(e.s<0||e.t>2*this.m.t)return e.mod(this.m);if(e.compareTo(this.m)<0)return e;var t=l();return e.copyTo(t),this.reduce(t),t}function vt(e){return e}function yt(e){for(e.drShiftTo(this.m.t-1,this.r2),e.t>this.m.t+1&&(e.t=this.m.t+1,e.clamp()),this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3),this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);e.compareTo(this.r2)<0;)e.dAddOffset(1,this.m.t+1);for(e.subTo(this.r2,e);e.compareTo(this.m)>=0;)e.subTo(this.m,e)}function bt(e,t){e.squareTo(t),this.reduce(t)}function xt(e,t,n){e.multiplyTo(t,n),this.reduce(n)}gt.prototype.convert=_t,gt.prototype.revert=vt,gt.prototype.reduce=yt,gt.prototype.mulTo=xt,gt.prototype.sqrTo=bt;function St(e,t){var n=e.bitLength(),r,i=S(1),a;if(n<=0)return i;r=n<18?1:n<48?3:n<144?4:n<768?5:6,a=n<8?new N(t):t.isEven()?new gt(t):new F(t);var o=[],s=3,c=r-1,u=(1<<r)-1;if(o[1]=a.convert(this),r>1){var d=l();for(a.sqrTo(o[1],d);s<=u;)o[s]=l(),a.mulTo(d,o[s-2],o[s]),s+=2}var f=e.t-1,p,m=!0,h=l(),g;for(n=k(e[f])-1;f>=0;){for(n>=c?p=e[f]>>n-c&u:(p=(e[f]&(1<<n+1)-1)<<c-n,f>0&&(p|=e[f-1]>>this.DB+n-c)),s=r;!(p&1);)p>>=1,--s;if((n-=s)<0&&(n+=this.DB,--f),m)o[p].copyTo(i),m=!1;else{for(;s>1;)a.sqrTo(i,h),a.sqrTo(h,i),s-=2;s>0?a.sqrTo(i,h):(g=i,i=h,h=g),a.mulTo(h,o[p],i)}for(;f>=0&&!(e[f]&1<<n);)a.sqrTo(i,h),g=i,i=h,h=g,--n<0&&(n=this.DB-1,--f)}return a.revert(i)}function Ct(e){var t=this.s<0?this.negate():this.clone(),n=e.s<0?e.negate():e.clone();if(t.compareTo(n)<0){var r=t;t=n,n=r}var i=t.getLowestSetBit(),a=n.getLowestSetBit();if(a<0)return t;for(i<a&&(a=i),a>0&&(t.rShiftTo(a,t),n.rShiftTo(a,n));t.signum()>0;)(i=t.getLowestSetBit())>0&&t.rShiftTo(i,t),(i=n.getLowestSetBit())>0&&n.rShiftTo(i,n),t.compareTo(n)>=0?(t.subTo(n,t),t.rShiftTo(1,t)):(n.subTo(t,n),n.rShiftTo(1,n));return a>0&&n.lShiftTo(a,n),n}function wt(e){if(e<=0)return 0;var t=this.DV%e,n=this.s<0?e-1:0;if(this.t>0){if(t==0)n=this[0]%e;else for(var r=this.t-1;r>=0;--r)n=(t*n+this[r])%e}return n}function Tt(e){var t=e.isEven();if(this.isEven()&&t||e.signum()==0)return c.ZERO;for(var n=e.clone(),r=this.clone(),i=S(1),a=S(0),o=S(0),s=S(1);n.signum()!=0;){for(;n.isEven();)n.rShiftTo(1,n),t?((!i.isEven()||!a.isEven())&&(i.addTo(this,i),a.subTo(e,a)),i.rShiftTo(1,i)):a.isEven()||a.subTo(e,a),a.rShiftTo(1,a);for(;r.isEven();)r.rShiftTo(1,r),t?((!o.isEven()||!s.isEven())&&(o.addTo(this,o),s.subTo(e,s)),o.rShiftTo(1,o)):s.isEven()||s.subTo(e,s),s.rShiftTo(1,s);n.compareTo(r)>=0?(n.subTo(r,n),t&&i.subTo(o,i),a.subTo(s,a)):(r.subTo(n,r),t&&o.subTo(i,o),s.subTo(a,s))}if(r.compareTo(c.ONE)!=0)return c.ZERO;if(s.compareTo(e)>=0)return s.subtract(e);if(s.signum()<0)s.addTo(e,s);else return s;return s.signum()<0?s.add(e):s}var L=[2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997],Et=(1<<26)/L[L.length-1];function Dt(e){var t,n=this.abs();if(n.t==1&&n[0]<=L[L.length-1]){for(t=0;t<L.length;++t)if(n[0]==L[t])return!0;return!1}if(n.isEven())return!1;for(t=1;t<L.length;){for(var r=L[t],i=t+1;i<L.length&&r<Et;)r*=L[i++];for(r=n.modInt(r);t<i;)if(r%L[t++]==0)return!1}return n.millerRabin(e)}function Ot(e){var t=this.subtract(c.ONE),n=t.getLowestSetBit();if(n<=0)return!1;var r=t.shiftRight(n);e=e+1>>1,e>L.length&&(e=L.length);for(var i=l(),a=0;a<e;++a){i.fromInt(L[Math.floor(Math.random()*L.length)]);var o=i.modPow(r,this);if(o.compareTo(c.ONE)!=0&&o.compareTo(t)!=0){for(var s=1;s++<n&&o.compareTo(t)!=0;)if(o=o.modPowInt(2,this),o.compareTo(c.ONE)==0)return!1;if(o.compareTo(t)!=0)return!1}}return!0}c.prototype.chunkSize=Ce,c.prototype.toRadix=Te,c.prototype.fromRadix=Ee,c.prototype.fromNumber=De,c.prototype.bitwiseTo=Me,c.prototype.changeBit=Ye,c.prototype.addTo=$e,c.prototype.dMultiply=st,c.prototype.dAddOffset=ct,c.prototype.multiplyLowerTo=mt,c.prototype.multiplyUpperTo=ht,c.prototype.modInt=wt,c.prototype.millerRabin=Ot,c.prototype.clone=ye,c.prototype.intValue=be,c.prototype.byteValue=xe,c.prototype.shortValue=Se,c.prototype.signum=we,c.prototype.toByteArray=Oe,c.prototype.equals=ke,c.prototype.min=Ae,c.prototype.max=je,c.prototype.and=Pe,c.prototype.or=Ie,c.prototype.xor=Re,c.prototype.andNot=Be,c.prototype.not=Ve,c.prototype.shiftLeft=He,c.prototype.shiftRight=Ue,c.prototype.getLowestSetBit=Ge,c.prototype.bitCount=qe,c.prototype.testBit=Je,c.prototype.setBit=Xe,c.prototype.clearBit=Ze,c.prototype.flipBit=Qe,c.prototype.add=et,c.prototype.subtract=tt,c.prototype.multiply=nt,c.prototype.divide=it,c.prototype.remainder=at,c.prototype.divideAndRemainder=ot,c.prototype.modPow=St,c.prototype.modInverse=Tt,c.prototype.pow=pt,c.prototype.gcd=Ct,c.prototype.isProbablePrime=Dt,c.prototype.square=rt;var R=c;R.prototype.IsNegative=function(){return this.compareTo(R.ZERO)==-1},R.op_Equality=function(e,t){return e.compareTo(t)==0},R.op_Inequality=function(e,t){return e.compareTo(t)!=0},R.op_GreaterThan=function(e,t){return e.compareTo(t)>0},R.op_LessThan=function(e,t){return e.compareTo(t)<0},R.op_Addition=function(e,t){return new R(e,void 0,void 0).add(new R(t,void 0,void 0))},R.op_Subtraction=function(e,t){return new R(e,void 0,void 0).subtract(new R(t,void 0,void 0))},R.Int128Mul=function(e,t){return new R(e,void 0,void 0).multiply(new R(t,void 0,void 0))},R.op_Division=function(e,t){return e.divide(t)},R.prototype.ToDouble=function(){return parseFloat(this.toString())};var z=function(e,t){var n;if(Object.getOwnPropertyNames===void 0){for(n in t.prototype)(e.prototype[n]===void 0||e.prototype[n]===Object.prototype[n])&&(e.prototype[n]=t.prototype[n]);for(n in t)e[n]===void 0&&(e[n]=t[n]);e.$baseCtor=t}else{for(var r=Object.getOwnPropertyNames(t.prototype),i=0;i<r.length;i++)Object.getOwnPropertyDescriptor(e.prototype,r[i])===void 0&&Object.defineProperty(e.prototype,r[i],Object.getOwnPropertyDescriptor(t.prototype,r[i]));for(n in t)e[n]===void 0&&(e[n]=t[n]);e.$baseCtor=t}};e.Path=function(){return[]},e.Path.prototype.push=Array.prototype.push,e.Paths=function(){return[]},e.Paths.prototype.push=Array.prototype.push,e.DoublePoint=function(){var e=arguments;this.X=0,this.Y=0,e.length===1?(this.X=e[0].X,this.Y=e[0].Y):e.length===2&&(this.X=e[0],this.Y=e[1])},e.DoublePoint0=function(){this.X=0,this.Y=0},e.DoublePoint0.prototype=e.DoublePoint.prototype,e.DoublePoint1=function(e){this.X=e.X,this.Y=e.Y},e.DoublePoint1.prototype=e.DoublePoint.prototype,e.DoublePoint2=function(e,t){this.X=e,this.Y=t},e.DoublePoint2.prototype=e.DoublePoint.prototype,e.PolyNode=function(){this.m_Parent=null,this.m_polygon=new e.Path,this.m_Index=0,this.m_jointype=0,this.m_endtype=0,this.m_Childs=[],this.IsOpen=!1},e.PolyNode.prototype.IsHoleNode=function(){for(var e=!0,t=this.m_Parent;t!==null;)e=!e,t=t.m_Parent;return e},e.PolyNode.prototype.ChildCount=function(){return this.m_Childs.length},e.PolyNode.prototype.Contour=function(){return this.m_polygon},e.PolyNode.prototype.AddChild=function(e){var t=this.m_Childs.length;this.m_Childs.push(e),e.m_Parent=this,e.m_Index=t},e.PolyNode.prototype.GetNext=function(){return this.m_Childs.length>0?this.m_Childs[0]:this.GetNextSiblingUp()},e.PolyNode.prototype.GetNextSiblingUp=function(){return this.m_Parent===null?null:this.m_Index===this.m_Parent.m_Childs.length-1?this.m_Parent.GetNextSiblingUp():this.m_Parent.m_Childs[this.m_Index+1]},e.PolyNode.prototype.Childs=function(){return this.m_Childs},e.PolyNode.prototype.Parent=function(){return this.m_Parent},e.PolyNode.prototype.IsHole=function(){return this.IsHoleNode()},e.PolyTree=function(){this.m_AllPolys=[],e.PolyNode.call(this)},e.PolyTree.prototype.Clear=function(){for(var e=0,t=this.m_AllPolys.length;e<t;e++)this.m_AllPolys[e]=null;this.m_AllPolys.length=0,this.m_Childs.length=0},e.PolyTree.prototype.GetFirst=function(){return this.m_Childs.length>0?this.m_Childs[0]:null},e.PolyTree.prototype.Total=function(){var e=this.m_AllPolys.length;return e>0&&this.m_Childs[0]!==this.m_AllPolys[0]&&e--,e},z(e.PolyTree,e.PolyNode),e.Math_Abs_Int64=e.Math_Abs_Int32=e.Math_Abs_Double=function(e){return Math.abs(e)},e.Math_Max_Int32_Int32=function(e,t){return Math.max(e,t)},e.Cast_Int32=a.msie||a.opera||a.safari?function(e){return e|0}:function(e){return~~e},Number.toInteger===void 0&&(Number.toInteger=null),e.Cast_Int64=a.chrome?function(e){return e<-2147483648||e>2147483647?e<0?Math.ceil(e):Math.floor(e):~~e}:a.firefox&&typeof Number.toInteger==`function`?function(e){return Number.toInteger(e)}:a.msie7||a.msie8?function(e){return parseInt(e,10)}:a.msie?function(e){return e<-2147483648||e>2147483647?e<0?Math.ceil(e):Math.floor(e):e|0}:function(e){return e<0?Math.ceil(e):Math.floor(e)},e.Clear=function(e){e.length=0},e.PI=3.141592653589793,e.PI2=6.283185307179586,e.IntPoint=function(){var t=arguments,n=t.length;if(this.X=0,this.Y=0,e.use_xyz){if(this.Z=0,n===3)this.X=t[0],this.Y=t[1],this.Z=t[2];else if(n===2)this.X=t[0],this.Y=t[1],this.Z=0;else if(n===1){if(t[0]instanceof e.DoublePoint){var r=t[0];this.X=e.Clipper.Round(r.X),this.Y=e.Clipper.Round(r.Y),this.Z=0}else{var i=t[0];i.Z===void 0&&(i.Z=0),this.X=i.X,this.Y=i.Y,this.Z=i.Z}}else this.X=0,this.Y=0,this.Z=0}else if(n===2)this.X=t[0],this.Y=t[1];else if(n===1){if(t[0]instanceof e.DoublePoint){var r=t[0];this.X=e.Clipper.Round(r.X),this.Y=e.Clipper.Round(r.Y)}else{var i=t[0];this.X=i.X,this.Y=i.Y}}else this.X=0,this.Y=0},e.IntPoint.op_Equality=function(e,t){return e.X===t.X&&e.Y===t.Y},e.IntPoint.op_Inequality=function(e,t){return e.X!==t.X||e.Y!==t.Y},e.IntPoint0=function(){this.X=0,this.Y=0,e.use_xyz&&(this.Z=0)},e.IntPoint0.prototype=e.IntPoint.prototype,e.IntPoint1=function(t){this.X=t.X,this.Y=t.Y,e.use_xyz&&(this.Z=t.Z===void 0?0:t.Z)},e.IntPoint1.prototype=e.IntPoint.prototype,e.IntPoint1dp=function(t){this.X=e.Clipper.Round(t.X),this.Y=e.Clipper.Round(t.Y),e.use_xyz&&(this.Z=0)},e.IntPoint1dp.prototype=e.IntPoint.prototype,e.IntPoint2=function(t,n,r){this.X=t,this.Y=n,e.use_xyz&&(this.Z=r===void 0?0:r)},e.IntPoint2.prototype=e.IntPoint.prototype,e.IntRect=function(){var e=arguments,t=e.length;if(t===4)this.left=e[0],this.top=e[1],this.right=e[2],this.bottom=e[3];else if(t===1){var n=e[0];this.left=n.left,this.top=n.top,this.right=n.right,this.bottom=n.bottom}else this.left=0,this.top=0,this.right=0,this.bottom=0},e.IntRect0=function(){this.left=0,this.top=0,this.right=0,this.bottom=0},e.IntRect0.prototype=e.IntRect.prototype,e.IntRect1=function(e){this.left=e.left,this.top=e.top,this.right=e.right,this.bottom=e.bottom},e.IntRect1.prototype=e.IntRect.prototype,e.IntRect4=function(e,t,n,r){this.left=e,this.top=t,this.right=n,this.bottom=r},e.IntRect4.prototype=e.IntRect.prototype,e.ClipType={ctIntersection:0,ctUnion:1,ctDifference:2,ctXor:3},e.PolyType={ptSubject:0,ptClip:1},e.PolyFillType={pftEvenOdd:0,pftNonZero:1,pftPositive:2,pftNegative:3},e.JoinType={jtSquare:0,jtRound:1,jtMiter:2},e.EndType={etOpenSquare:0,etOpenRound:1,etOpenButt:2,etClosedLine:3,etClosedPolygon:4},e.EdgeSide={esLeft:0,esRight:1},e.Direction={dRightToLeft:0,dLeftToRight:1},e.TEdge=function(){this.Bot=new e.IntPoint0,this.Curr=new e.IntPoint0,this.Top=new e.IntPoint0,this.Delta=new e.IntPoint0,this.Dx=0,this.PolyTyp=e.PolyType.ptSubject,this.Side=e.EdgeSide.esLeft,this.WindDelta=0,this.WindCnt=0,this.WindCnt2=0,this.OutIdx=0,this.Next=null,this.Prev=null,this.NextInLML=null,this.NextInAEL=null,this.PrevInAEL=null,this.NextInSEL=null,this.PrevInSEL=null},e.IntersectNode=function(){this.Edge1=null,this.Edge2=null,this.Pt=new e.IntPoint0},e.MyIntersectNodeSort=function(){},e.MyIntersectNodeSort.Compare=function(e,t){var n=t.Pt.Y-e.Pt.Y;return n>0?1:n<0?-1:0},e.LocalMinima=function(){this.Y=0,this.LeftBound=null,this.RightBound=null,this.Next=null},e.Scanbeam=function(){this.Y=0,this.Next=null},e.Maxima=function(){this.X=0,this.Next=null,this.Prev=null},e.OutRec=function(){this.Idx=0,this.IsHole=!1,this.IsOpen=!1,this.FirstLeft=null,this.Pts=null,this.BottomPt=null,this.PolyNode=null},e.OutPt=function(){this.Idx=0,this.Pt=new e.IntPoint0,this.Next=null,this.Prev=null},e.Join=function(){this.OutPt1=null,this.OutPt2=null,this.OffPt=new e.IntPoint0},e.ClipperBase=function(){this.m_MinimaList=null,this.m_CurrentLM=null,this.m_edges=[],this.m_UseFullRange=!1,this.m_HasOpenPaths=!1,this.PreserveCollinear=!1,this.m_Scanbeam=null,this.m_PolyOuts=null,this.m_ActiveEdges=null},e.ClipperBase.horizontal=-9007199254740992,e.ClipperBase.Skip=-2,e.ClipperBase.Unassigned=-1,e.ClipperBase.tolerance=1e-20,e.ClipperBase.loRange=47453132,e.ClipperBase.hiRange=0xfffffffffffff,e.ClipperBase.near_zero=function(t){return t>-e.ClipperBase.tolerance&&t<e.ClipperBase.tolerance},e.ClipperBase.IsHorizontal=function(e){return e.Delta.Y===0},e.ClipperBase.prototype.PointIsVertex=function(t,n){var r=n;do{if(e.IntPoint.op_Equality(r.Pt,t))return!0;r=r.Next}while(r!==n);return!1},e.ClipperBase.prototype.PointOnLineSegment=function(e,t,n,r){return r?e.X===t.X&&e.Y===t.Y||e.X===n.X&&e.Y===n.Y||e.X>t.X==e.X<n.X&&e.Y>t.Y==e.Y<n.Y&&R.op_Equality(R.Int128Mul(e.X-t.X,n.Y-t.Y),R.Int128Mul(n.X-t.X,e.Y-t.Y)):e.X===t.X&&e.Y===t.Y||e.X===n.X&&e.Y===n.Y||e.X>t.X==e.X<n.X&&e.Y>t.Y==e.Y<n.Y&&(e.X-t.X)*(n.Y-t.Y)===(n.X-t.X)*(e.Y-t.Y)},e.ClipperBase.prototype.PointOnPolygon=function(e,t,n){for(var r=t;;){if(this.PointOnLineSegment(e,r.Pt,r.Next.Pt,n))return!0;if(r=r.Next,r===t)break}return!1},e.ClipperBase.prototype.SlopesEqual=e.ClipperBase.SlopesEqual=function(){var t=arguments,n=t.length,r,i,a,o,s,c,l;return n===3?(r=t[0],i=t[1],l=t[2],l?R.op_Equality(R.Int128Mul(r.Delta.Y,i.Delta.X),R.Int128Mul(r.Delta.X,i.Delta.Y)):e.Cast_Int64(r.Delta.Y*i.Delta.X)===e.Cast_Int64(r.Delta.X*i.Delta.Y)):n===4?(a=t[0],o=t[1],s=t[2],l=t[3],l?R.op_Equality(R.Int128Mul(a.Y-o.Y,o.X-s.X),R.Int128Mul(a.X-o.X,o.Y-s.Y)):e.Cast_Int64((a.Y-o.Y)*(o.X-s.X))-e.Cast_Int64((a.X-o.X)*(o.Y-s.Y))===0):(a=t[0],o=t[1],s=t[2],c=t[3],l=t[4],l?R.op_Equality(R.Int128Mul(a.Y-o.Y,s.X-c.X),R.Int128Mul(a.X-o.X,s.Y-c.Y)):e.Cast_Int64((a.Y-o.Y)*(s.X-c.X))-e.Cast_Int64((a.X-o.X)*(s.Y-c.Y))===0)},e.ClipperBase.SlopesEqual3=function(t,n,r){return r?R.op_Equality(R.Int128Mul(t.Delta.Y,n.Delta.X),R.Int128Mul(t.Delta.X,n.Delta.Y)):e.Cast_Int64(t.Delta.Y*n.Delta.X)===e.Cast_Int64(t.Delta.X*n.Delta.Y)},e.ClipperBase.SlopesEqual4=function(t,n,r,i){return i?R.op_Equality(R.Int128Mul(t.Y-n.Y,n.X-r.X),R.Int128Mul(t.X-n.X,n.Y-r.Y)):e.Cast_Int64((t.Y-n.Y)*(n.X-r.X))-e.Cast_Int64((t.X-n.X)*(n.Y-r.Y))===0},e.ClipperBase.SlopesEqual5=function(t,n,r,i,a){return a?R.op_Equality(R.Int128Mul(t.Y-n.Y,r.X-i.X),R.Int128Mul(t.X-n.X,r.Y-i.Y)):e.Cast_Int64((t.Y-n.Y)*(r.X-i.X))-e.Cast_Int64((t.X-n.X)*(r.Y-i.Y))===0},e.ClipperBase.prototype.Clear=function(){this.DisposeLocalMinimaList();for(var t=0,n=this.m_edges.length;t<n;++t){for(var r=0,i=this.m_edges[t].length;r<i;++r)this.m_edges[t][r]=null;e.Clear(this.m_edges[t])}e.Clear(this.m_edges),this.m_UseFullRange=!1,this.m_HasOpenPaths=!1},e.ClipperBase.prototype.DisposeLocalMinimaList=function(){for(;this.m_MinimaList!==null;){var e=this.m_MinimaList.Next;this.m_MinimaList=null,this.m_MinimaList=e}this.m_CurrentLM=null},e.ClipperBase.prototype.RangeTest=function(t,n){n.Value?(t.X>e.ClipperBase.hiRange||t.Y>e.ClipperBase.hiRange||-t.X>e.ClipperBase.hiRange||-t.Y>e.ClipperBase.hiRange)&&e.Error(`Coordinate outside allowed range in RangeTest().`):(t.X>e.ClipperBase.loRange||t.Y>e.ClipperBase.loRange||-t.X>e.ClipperBase.loRange||-t.Y>e.ClipperBase.loRange)&&(n.Value=!0,this.RangeTest(t,n))},e.ClipperBase.prototype.InitEdge=function(t,n,r,i){t.Next=n,t.Prev=r,t.Curr.X=i.X,t.Curr.Y=i.Y,e.use_xyz&&(t.Curr.Z=i.Z),t.OutIdx=-1},e.ClipperBase.prototype.InitEdge2=function(t,n){t.Curr.Y>=t.Next.Curr.Y?(t.Bot.X=t.Curr.X,t.Bot.Y=t.Curr.Y,e.use_xyz&&(t.Bot.Z=t.Curr.Z),t.Top.X=t.Next.Curr.X,t.Top.Y=t.Next.Curr.Y,e.use_xyz&&(t.Top.Z=t.Next.Curr.Z)):(t.Top.X=t.Curr.X,t.Top.Y=t.Curr.Y,e.use_xyz&&(t.Top.Z=t.Curr.Z),t.Bot.X=t.Next.Curr.X,t.Bot.Y=t.Next.Curr.Y,e.use_xyz&&(t.Bot.Z=t.Next.Curr.Z)),this.SetDx(t),t.PolyTyp=n},e.ClipperBase.prototype.FindNextLocMin=function(t){for(var n;;){for(;e.IntPoint.op_Inequality(t.Bot,t.Prev.Bot)||e.IntPoint.op_Equality(t.Curr,t.Top);)t=t.Next;if(t.Dx!==e.ClipperBase.horizontal&&t.Prev.Dx!==e.ClipperBase.horizontal)break;for(;t.Prev.Dx===e.ClipperBase.horizontal;)t=t.Prev;for(n=t;t.Dx===e.ClipperBase.horizontal;)t=t.Next;if(t.Top.Y!==t.Prev.Bot.Y){n.Prev.Bot.X<t.Bot.X&&(t=n);break}}return t},e.ClipperBase.prototype.ProcessBound=function(t,n){var r,i=t,a;if(i.OutIdx===e.ClipperBase.Skip){if(t=i,n){for(;t.Top.Y===t.Next.Bot.Y;)t=t.Next;for(;t!==i&&t.Dx===e.ClipperBase.horizontal;)t=t.Prev}else{for(;t.Top.Y===t.Prev.Bot.Y;)t=t.Prev;for(;t!==i&&t.Dx===e.ClipperBase.horizontal;)t=t.Next}if(t===i)i=n?t.Next:t.Prev;else{t=n?i.Next:i.Prev;var o=new e.LocalMinima;o.Next=null,o.Y=t.Bot.Y,o.LeftBound=null,o.RightBound=t,t.WindDelta=0,i=this.ProcessBound(t,n),this.InsertLocalMinima(o)}return i}if(t.Dx===e.ClipperBase.horizontal&&(r=n?t.Prev:t.Next,r.Dx===e.ClipperBase.horizontal?r.Bot.X!==t.Bot.X&&r.Top.X!==t.Bot.X&&this.ReverseHorizontal(t):r.Bot.X!==t.Bot.X&&this.ReverseHorizontal(t)),r=t,n){for(;i.Top.Y===i.Next.Bot.Y&&i.Next.OutIdx!==e.ClipperBase.Skip;)i=i.Next;if(i.Dx===e.ClipperBase.horizontal&&i.Next.OutIdx!==e.ClipperBase.Skip){for(a=i;a.Prev.Dx===e.ClipperBase.horizontal;)a=a.Prev;a.Prev.Top.X>i.Next.Top.X&&(i=a.Prev)}for(;t!==i;)t.NextInLML=t.Next,t.Dx===e.ClipperBase.horizontal&&t!==r&&t.Bot.X!==t.Prev.Top.X&&this.ReverseHorizontal(t),t=t.Next;t.Dx===e.ClipperBase.horizontal&&t!==r&&t.Bot.X!==t.Prev.Top.X&&this.ReverseHorizontal(t),i=i.Next}else{for(;i.Top.Y===i.Prev.Bot.Y&&i.Prev.OutIdx!==e.ClipperBase.Skip;)i=i.Prev;if(i.Dx===e.ClipperBase.horizontal&&i.Prev.OutIdx!==e.ClipperBase.Skip){for(a=i;a.Next.Dx===e.ClipperBase.horizontal;)a=a.Next;(a.Next.Top.X===i.Prev.Top.X||a.Next.Top.X>i.Prev.Top.X)&&(i=a.Next)}for(;t!==i;)t.NextInLML=t.Prev,t.Dx===e.ClipperBase.horizontal&&t!==r&&t.Bot.X!==t.Next.Top.X&&this.ReverseHorizontal(t),t=t.Prev;t.Dx===e.ClipperBase.horizontal&&t!==r&&t.Bot.X!==t.Next.Top.X&&this.ReverseHorizontal(t),i=i.Prev}return i},e.ClipperBase.prototype.AddPath=function(t,n,r){e.use_lines?!r&&n===e.PolyType.ptClip&&e.Error(`AddPath: Open paths must be subject.`):r||e.Error(`AddPath: Open paths have been disabled.`);var i=t.length-1;if(r)for(;i>0&&e.IntPoint.op_Equality(t[i],t[0]);)--i;for(;i>0&&e.IntPoint.op_Equality(t[i],t[i-1]);)--i;if(r&&i<2||!r&&i<1)return!1;for(var a=[],o=0;o<=i;o++)a.push(new e.TEdge);var s=!0;a[1].Curr.X=t[1].X,a[1].Curr.Y=t[1].Y,e.use_xyz&&(a[1].Curr.Z=t[1].Z);var c={Value:this.m_UseFullRange};this.RangeTest(t[0],c),this.m_UseFullRange=c.Value,c.Value=this.m_UseFullRange,this.RangeTest(t[i],c),this.m_UseFullRange=c.Value,this.InitEdge(a[0],a[1],a[i],t[0]),this.InitEdge(a[i],a[0],a[i-1],t[i]);for(var o=i-1;o>=1;--o)c.Value=this.m_UseFullRange,this.RangeTest(t[o],c),this.m_UseFullRange=c.Value,this.InitEdge(a[o],a[o+1],a[o-1],t[o]);for(var l=a[0],u=l,d=l;;)if(u.Curr===u.Next.Curr&&(r||u.Next!==l)){if(u===u.Next)break;u===l&&(l=u.Next),u=this.RemoveEdge(u),d=u}else{if(u.Prev===u.Next)break;if(r&&e.ClipperBase.SlopesEqual4(u.Prev.Curr,u.Curr,u.Next.Curr,this.m_UseFullRange)&&(!this.PreserveCollinear||!this.Pt2IsBetweenPt1AndPt3(u.Prev.Curr,u.Curr,u.Next.Curr)))u===l&&(l=u.Next),u=this.RemoveEdge(u),u=u.Prev,d=u;else if(u=u.Next,u===d||!r&&u.Next===l)break}if(!r&&u===u.Next||r&&u.Prev===u.Next)return!1;r||(this.m_HasOpenPaths=!0,l.Prev.OutIdx=e.ClipperBase.Skip),u=l;do this.InitEdge2(u,n),u=u.Next,s&&u.Curr.Y!==l.Curr.Y&&(s=!1);while(u!==l);if(s){if(r)return!1;u.Prev.OutIdx=e.ClipperBase.Skip;var f=new e.LocalMinima;for(f.Next=null,f.Y=u.Bot.Y,f.LeftBound=null,f.RightBound=u,f.RightBound.Side=e.EdgeSide.esRight,f.RightBound.WindDelta=0;u.Bot.X!==u.Prev.Top.X&&this.ReverseHorizontal(u),u.Next.OutIdx!==e.ClipperBase.Skip;)u.NextInLML=u.Next,u=u.Next;return this.InsertLocalMinima(f),this.m_edges.push(a),!0}this.m_edges.push(a);var p,m=null;for(e.IntPoint.op_Equality(u.Prev.Bot,u.Prev.Top)&&(u=u.Next);u=this.FindNextLocMin(u),u!==m;){m===null&&(m=u);var f=new e.LocalMinima;f.Next=null,f.Y=u.Bot.Y,u.Dx<u.Prev.Dx?(f.LeftBound=u.Prev,f.RightBound=u,p=!1):(f.LeftBound=u,f.RightBound=u.Prev,p=!0),f.LeftBound.Side=e.EdgeSide.esLeft,f.RightBound.Side=e.EdgeSide.esRight,r?f.LeftBound.Next===f.RightBound?f.LeftBound.WindDelta=-1:f.LeftBound.WindDelta=1:f.LeftBound.WindDelta=0,f.RightBound.WindDelta=-f.LeftBound.WindDelta,u=this.ProcessBound(f.LeftBound,p),u.OutIdx===e.ClipperBase.Skip&&(u=this.ProcessBound(u,p));var h=this.ProcessBound(f.RightBound,!p);h.OutIdx===e.ClipperBase.Skip&&(h=this.ProcessBound(h,!p)),f.LeftBound.OutIdx===e.ClipperBase.Skip?f.LeftBound=null:f.RightBound.OutIdx===e.ClipperBase.Skip&&(f.RightBound=null),this.InsertLocalMinima(f),p||(u=h)}return!0},e.ClipperBase.prototype.AddPaths=function(e,t,n){for(var r=!1,i=0,a=e.length;i<a;++i)this.AddPath(e[i],t,n)&&(r=!0);return r},e.ClipperBase.prototype.Pt2IsBetweenPt1AndPt3=function(t,n,r){return e.IntPoint.op_Equality(t,r)||e.IntPoint.op_Equality(t,n)||e.IntPoint.op_Equality(r,n)?!1:t.X===r.X?n.Y>t.Y==n.Y<r.Y:n.X>t.X==n.X<r.X},e.ClipperBase.prototype.RemoveEdge=function(e){e.Prev.Next=e.Next,e.Next.Prev=e.Prev;var t=e.Next;return e.Prev=null,t},e.ClipperBase.prototype.SetDx=function(t){t.Delta.X=t.Top.X-t.Bot.X,t.Delta.Y=t.Top.Y-t.Bot.Y,t.Dx=t.Delta.Y===0?e.ClipperBase.horizontal:t.Delta.X/t.Delta.Y},e.ClipperBase.prototype.InsertLocalMinima=function(e){if(this.m_MinimaList===null)this.m_MinimaList=e;else if(e.Y>=this.m_MinimaList.Y)e.Next=this.m_MinimaList,this.m_MinimaList=e;else{for(var t=this.m_MinimaList;t.Next!==null&&e.Y<t.Next.Y;)t=t.Next;e.Next=t.Next,t.Next=e}},e.ClipperBase.prototype.PopLocalMinima=function(e,t){return t.v=this.m_CurrentLM,this.m_CurrentLM!==null&&this.m_CurrentLM.Y===e&&(this.m_CurrentLM=this.m_CurrentLM.Next,!0)},e.ClipperBase.prototype.ReverseHorizontal=function(t){var n=t.Top.X;t.Top.X=t.Bot.X,t.Bot.X=n,e.use_xyz&&(n=t.Top.Z,t.Top.Z=t.Bot.Z,t.Bot.Z=n)},e.ClipperBase.prototype.Reset=function(){if(this.m_CurrentLM=this.m_MinimaList,this.m_CurrentLM!==null){this.m_Scanbeam=null;for(var t=this.m_MinimaList;t!==null;){this.InsertScanbeam(t.Y);var n=t.LeftBound;n!==null&&(n.Curr.X=n.Bot.X,n.Curr.Y=n.Bot.Y,e.use_xyz&&(n.Curr.Z=n.Bot.Z),n.OutIdx=e.ClipperBase.Unassigned),n=t.RightBound,n!==null&&(n.Curr.X=n.Bot.X,n.Curr.Y=n.Bot.Y,e.use_xyz&&(n.Curr.Z=n.Bot.Z),n.OutIdx=e.ClipperBase.Unassigned),t=t.Next}this.m_ActiveEdges=null}},e.ClipperBase.prototype.InsertScanbeam=function(t){if(this.m_Scanbeam===null)this.m_Scanbeam=new e.Scanbeam,this.m_Scanbeam.Next=null,this.m_Scanbeam.Y=t;else if(t>this.m_Scanbeam.Y){var n=new e.Scanbeam;n.Y=t,n.Next=this.m_Scanbeam,this.m_Scanbeam=n}else{for(var r=this.m_Scanbeam;r.Next!==null&&t<=r.Next.Y;)r=r.Next;if(t===r.Y)return;var i=new e.Scanbeam;i.Y=t,i.Next=r.Next,r.Next=i}},e.ClipperBase.prototype.PopScanbeam=function(e){return this.m_Scanbeam===null?(e.v=0,!1):(e.v=this.m_Scanbeam.Y,this.m_Scanbeam=this.m_Scanbeam.Next,!0)},e.ClipperBase.prototype.LocalMinimaPending=function(){return this.m_CurrentLM!==null},e.ClipperBase.prototype.CreateOutRec=function(){var t=new e.OutRec;return t.Idx=e.ClipperBase.Unassigned,t.IsHole=!1,t.IsOpen=!1,t.FirstLeft=null,t.Pts=null,t.BottomPt=null,t.PolyNode=null,this.m_PolyOuts.push(t),t.Idx=this.m_PolyOuts.length-1,t},e.ClipperBase.prototype.DisposeOutRec=function(e){var t=this.m_PolyOuts[e];t.Pts=null,t=null,this.m_PolyOuts[e]=null},e.ClipperBase.prototype.UpdateEdgeIntoAEL=function(t){t.NextInLML===null&&e.Error(`UpdateEdgeIntoAEL: invalid call`);var n=t.PrevInAEL,r=t.NextInAEL;return t.NextInLML.OutIdx=t.OutIdx,n===null?this.m_ActiveEdges=t.NextInLML:n.NextInAEL=t.NextInLML,r!==null&&(r.PrevInAEL=t.NextInLML),t.NextInLML.Side=t.Side,t.NextInLML.WindDelta=t.WindDelta,t.NextInLML.WindCnt=t.WindCnt,t.NextInLML.WindCnt2=t.WindCnt2,t=t.NextInLML,t.Curr.X=t.Bot.X,t.Curr.Y=t.Bot.Y,t.PrevInAEL=n,t.NextInAEL=r,e.ClipperBase.IsHorizontal(t)||this.InsertScanbeam(t.Top.Y),t},e.ClipperBase.prototype.SwapPositionsInAEL=function(e,t){if(e.NextInAEL!==e.PrevInAEL&&t.NextInAEL!==t.PrevInAEL){if(e.NextInAEL===t){var n=t.NextInAEL;n!==null&&(n.PrevInAEL=e);var r=e.PrevInAEL;r!==null&&(r.NextInAEL=t),t.PrevInAEL=r,t.NextInAEL=e,e.PrevInAEL=t,e.NextInAEL=n}else if(t.NextInAEL===e){var i=e.NextInAEL;i!==null&&(i.PrevInAEL=t);var a=t.PrevInAEL;a!==null&&(a.NextInAEL=e),e.PrevInAEL=a,e.NextInAEL=t,t.PrevInAEL=e,t.NextInAEL=i}else{var o=e.NextInAEL,s=e.PrevInAEL;e.NextInAEL=t.NextInAEL,e.NextInAEL!==null&&(e.NextInAEL.PrevInAEL=e),e.PrevInAEL=t.PrevInAEL,e.PrevInAEL!==null&&(e.PrevInAEL.NextInAEL=e),t.NextInAEL=o,t.NextInAEL!==null&&(t.NextInAEL.PrevInAEL=t),t.PrevInAEL=s,t.PrevInAEL!==null&&(t.PrevInAEL.NextInAEL=t)}e.PrevInAEL===null?this.m_ActiveEdges=e:t.PrevInAEL===null&&(this.m_ActiveEdges=t)}},e.ClipperBase.prototype.DeleteFromAEL=function(e){var t=e.PrevInAEL,n=e.NextInAEL;(t!==null||n!==null||e===this.m_ActiveEdges)&&(t===null?this.m_ActiveEdges=n:t.NextInAEL=n,n!==null&&(n.PrevInAEL=t),e.NextInAEL=null,e.PrevInAEL=null)},e.Clipper=function(t){t===void 0&&(t=0),this.m_PolyOuts=null,this.m_ClipType=e.ClipType.ctIntersection,this.m_Scanbeam=null,this.m_Maxima=null,this.m_ActiveEdges=null,this.m_SortedEdges=null,this.m_IntersectList=null,this.m_IntersectNodeComparer=null,this.m_ExecuteLocked=!1,this.m_ClipFillType=e.PolyFillType.pftEvenOdd,this.m_SubjFillType=e.PolyFillType.pftEvenOdd,this.m_Joins=null,this.m_GhostJoins=null,this.m_UsingPolyTree=!1,this.ReverseSolution=!1,this.StrictlySimple=!1,e.ClipperBase.call(this),this.m_Scanbeam=null,this.m_Maxima=null,this.m_ActiveEdges=null,this.m_SortedEdges=null,this.m_IntersectList=[],this.m_IntersectNodeComparer=e.MyIntersectNodeSort.Compare,this.m_ExecuteLocked=!1,this.m_UsingPolyTree=!1,this.m_PolyOuts=[],this.m_Joins=[],this.m_GhostJoins=[],this.ReverseSolution=!!(1&t),this.StrictlySimple=!!(2&t),this.PreserveCollinear=!!(4&t),e.use_xyz&&(this.ZFillFunction=null)},e.Clipper.ioReverseSolution=1,e.Clipper.ioStrictlySimple=2,e.Clipper.ioPreserveCollinear=4,e.Clipper.prototype.Clear=function(){this.m_edges.length!==0&&(this.DisposeAllPolyPts(),e.ClipperBase.prototype.Clear.call(this))},e.Clipper.prototype.InsertMaxima=function(t){var n=new e.Maxima;if(n.X=t,this.m_Maxima===null)this.m_Maxima=n,this.m_Maxima.Next=null,this.m_Maxima.Prev=null;else if(t<this.m_Maxima.X)n.Next=this.m_Maxima,n.Prev=null,this.m_Maxima=n;else{for(var r=this.m_Maxima;r.Next!==null&&t>=r.Next.X;)r=r.Next;if(t===r.X)return;n.Next=r.Next,n.Prev=r,r.Next!==null&&(r.Next.Prev=n),r.Next=n}},e.Clipper.prototype.Execute=function(){var t=arguments,n=t.length,r=t[1]instanceof e.PolyTree;if(n===4&&!r){var i=t[0],a=t[1],o=t[2],s=t[3];if(this.m_ExecuteLocked)return!1;this.m_HasOpenPaths&&e.Error(`Error: PolyTree struct is needed for open path clipping.`),this.m_ExecuteLocked=!0,e.Clear(a),this.m_SubjFillType=o,this.m_ClipFillType=s,this.m_ClipType=i,this.m_UsingPolyTree=!1;try{var c=this.ExecuteInternal();c&&this.BuildResult(a)}finally{this.DisposeAllPolyPts(),this.m_ExecuteLocked=!1}return c}if(n===4&&r){var i=t[0],l=t[1],o=t[2],s=t[3];if(this.m_ExecuteLocked)return!1;this.m_ExecuteLocked=!0,this.m_SubjFillType=o,this.m_ClipFillType=s,this.m_ClipType=i,this.m_UsingPolyTree=!0;try{var c=this.ExecuteInternal();c&&this.BuildResult2(l)}finally{this.DisposeAllPolyPts(),this.m_ExecuteLocked=!1}return c}if(n===2&&!r){var i=t[0],a=t[1];return this.Execute(i,a,e.PolyFillType.pftEvenOdd,e.PolyFillType.pftEvenOdd)}if(n===2&&r){var i=t[0],l=t[1];return this.Execute(i,l,e.PolyFillType.pftEvenOdd,e.PolyFillType.pftEvenOdd)}},e.Clipper.prototype.FixHoleLinkage=function(e){if(!(e.FirstLeft===null||e.IsHole!==e.FirstLeft.IsHole&&e.FirstLeft.Pts!==null)){for(var t=e.FirstLeft;t!==null&&(t.IsHole===e.IsHole||t.Pts===null);)t=t.FirstLeft;e.FirstLeft=t}},e.Clipper.prototype.ExecuteInternal=function(){try{this.Reset(),this.m_SortedEdges=null,this.m_Maxima=null;var e={},t={};if(!this.PopScanbeam(e))return!1;for(this.InsertLocalMinimaIntoAEL(e.v);this.PopScanbeam(t)||this.LocalMinimaPending();){if(this.ProcessHorizontals(),this.m_GhostJoins.length=0,!this.ProcessIntersections(t.v))return!1;this.ProcessEdgesAtTopOfScanbeam(t.v),e.v=t.v,this.InsertLocalMinimaIntoAEL(e.v)}for(var n,r=0,i=this.m_PolyOuts.length;r<i;r++)n=this.m_PolyOuts[r],!(n.Pts===null||n.IsOpen)&&(n.IsHole^this.ReverseSolution)==this.Area$1(n)>0&&this.ReversePolyPtLinks(n.Pts);for(this.JoinCommonEdges(),r=0,i=this.m_PolyOuts.length;r<i;r++)n=this.m_PolyOuts[r],n.Pts!==null&&(n.IsOpen?this.FixupOutPolyline(n):this.FixupOutPolygon(n));return this.StrictlySimple&&this.DoSimplePolygons(),!0}finally{this.m_Joins.length=0,this.m_GhostJoins.length=0}},e.Clipper.prototype.DisposeAllPolyPts=function(){for(var t=0,n=this.m_PolyOuts.length;t<n;++t)this.DisposeOutRec(t);e.Clear(this.m_PolyOuts)},e.Clipper.prototype.AddJoin=function(t,n,r){var i=new e.Join;i.OutPt1=t,i.OutPt2=n,i.OffPt.X=r.X,i.OffPt.Y=r.Y,e.use_xyz&&(i.OffPt.Z=r.Z),this.m_Joins.push(i)},e.Clipper.prototype.AddGhostJoin=function(t,n){var r=new e.Join;r.OutPt1=t,r.OffPt.X=n.X,r.OffPt.Y=n.Y,e.use_xyz&&(r.OffPt.Z=n.Z),this.m_GhostJoins.push(r)},e.Clipper.prototype.SetZ=function(t,n,r){if(this.ZFillFunction!==null){if(t.Z!==0||this.ZFillFunction===null)return;e.IntPoint.op_Equality(t,n.Bot)?t.Z=n.Bot.Z:e.IntPoint.op_Equality(t,n.Top)?t.Z=n.Top.Z:e.IntPoint.op_Equality(t,r.Bot)?t.Z=r.Bot.Z:e.IntPoint.op_Equality(t,r.Top)?t.Z=r.Top.Z:this.ZFillFunction(n.Bot,n.Top,r.Bot,r.Top,t)}},e.Clipper.prototype.InsertLocalMinimaIntoAEL=function(t){for(var n={},r,i;this.PopLocalMinima(t,n);){r=n.v.LeftBound,i=n.v.RightBound;var a=null;if(r===null?(this.InsertEdgeIntoAEL(i,null),this.SetWindingCount(i),this.IsContributing(i)&&(a=this.AddOutPt(i,i.Bot))):i===null?(this.InsertEdgeIntoAEL(r,null),this.SetWindingCount(r),this.IsContributing(r)&&(a=this.AddOutPt(r,r.Bot)),this.InsertScanbeam(r.Top.Y)):(this.InsertEdgeIntoAEL(r,null),this.InsertEdgeIntoAEL(i,r),this.SetWindingCount(r),i.WindCnt=r.WindCnt,i.WindCnt2=r.WindCnt2,this.IsContributing(r)&&(a=this.AddLocalMinPoly(r,i,r.Bot)),this.InsertScanbeam(r.Top.Y)),i!==null&&(e.ClipperBase.IsHorizontal(i)?(i.NextInLML!==null&&this.InsertScanbeam(i.NextInLML.Top.Y),this.AddEdgeToSEL(i)):this.InsertScanbeam(i.Top.Y)),r!==null&&i!==null){if(a!==null&&e.ClipperBase.IsHorizontal(i)&&this.m_GhostJoins.length>0&&i.WindDelta!==0)for(var o=0,s=this.m_GhostJoins.length;o<s;o++){var c=this.m_GhostJoins[o];this.HorzSegmentsOverlap(c.OutPt1.Pt.X,c.OffPt.X,i.Bot.X,i.Top.X)&&this.AddJoin(c.OutPt1,a,c.OffPt)}if(r.OutIdx>=0&&r.PrevInAEL!==null&&r.PrevInAEL.Curr.X===r.Bot.X&&r.PrevInAEL.OutIdx>=0&&e.ClipperBase.SlopesEqual5(r.PrevInAEL.Curr,r.PrevInAEL.Top,r.Curr,r.Top,this.m_UseFullRange)&&r.WindDelta!==0&&r.PrevInAEL.WindDelta!==0){var l=this.AddOutPt(r.PrevInAEL,r.Bot);this.AddJoin(a,l,r.Top)}if(r.NextInAEL!==i){if(i.OutIdx>=0&&i.PrevInAEL.OutIdx>=0&&e.ClipperBase.SlopesEqual5(i.PrevInAEL.Curr,i.PrevInAEL.Top,i.Curr,i.Top,this.m_UseFullRange)&&i.WindDelta!==0&&i.PrevInAEL.WindDelta!==0){var l=this.AddOutPt(i.PrevInAEL,i.Bot);this.AddJoin(a,l,i.Top)}var u=r.NextInAEL;if(u!==null)for(;u!==i;)this.IntersectEdges(i,u,r.Curr),u=u.NextInAEL}}}},e.Clipper.prototype.InsertEdgeIntoAEL=function(e,t){if(this.m_ActiveEdges===null)e.PrevInAEL=null,e.NextInAEL=null,this.m_ActiveEdges=e;else if(t===null&&this.E2InsertsBeforeE1(this.m_ActiveEdges,e))e.PrevInAEL=null,e.NextInAEL=this.m_ActiveEdges,this.m_ActiveEdges.PrevInAEL=e,this.m_ActiveEdges=e;else{for(t===null&&(t=this.m_ActiveEdges);t.NextInAEL!==null&&!this.E2InsertsBeforeE1(t.NextInAEL,e);)t=t.NextInAEL;e.NextInAEL=t.NextInAEL,t.NextInAEL!==null&&(t.NextInAEL.PrevInAEL=e),e.PrevInAEL=t,t.NextInAEL=e}},e.Clipper.prototype.E2InsertsBeforeE1=function(t,n){return n.Curr.X===t.Curr.X?n.Top.Y>t.Top.Y?n.Top.X<e.Clipper.TopX(t,n.Top.Y):t.Top.X>e.Clipper.TopX(n,t.Top.Y):n.Curr.X<t.Curr.X},e.Clipper.prototype.IsEvenOddFillType=function(t){return t.PolyTyp===e.PolyType.ptSubject?this.m_SubjFillType===e.PolyFillType.pftEvenOdd:this.m_ClipFillType===e.PolyFillType.pftEvenOdd},e.Clipper.prototype.IsEvenOddAltFillType=function(t){return t.PolyTyp===e.PolyType.ptSubject?this.m_ClipFillType===e.PolyFillType.pftEvenOdd:this.m_SubjFillType===e.PolyFillType.pftEvenOdd},e.Clipper.prototype.IsContributing=function(t){var n,r;switch(t.PolyTyp===e.PolyType.ptSubject?(n=this.m_SubjFillType,r=this.m_ClipFillType):(n=this.m_ClipFillType,r=this.m_SubjFillType),n){case e.PolyFillType.pftEvenOdd:if(t.WindDelta===0&&t.WindCnt!==1)return!1;break;case e.PolyFillType.pftNonZero:if(Math.abs(t.WindCnt)!==1)return!1;break;case e.PolyFillType.pftPositive:if(t.WindCnt!==1)return!1;break;default:if(t.WindCnt!==-1)return!1}switch(this.m_ClipType){case e.ClipType.ctIntersection:switch(r){case e.PolyFillType.pftEvenOdd:case e.PolyFillType.pftNonZero:return t.WindCnt2!==0;case e.PolyFillType.pftPositive:return t.WindCnt2>0;default:return t.WindCnt2<0}case e.ClipType.ctUnion:switch(r){case e.PolyFillType.pftEvenOdd:case e.PolyFillType.pftNonZero:return t.WindCnt2===0;case e.PolyFillType.pftPositive:return t.WindCnt2<=0;default:return t.WindCnt2>=0}case e.ClipType.ctDifference:if(t.PolyTyp===e.PolyType.ptSubject)switch(r){case e.PolyFillType.pftEvenOdd:case e.PolyFillType.pftNonZero:return t.WindCnt2===0;case e.PolyFillType.pftPositive:return t.WindCnt2<=0;default:return t.WindCnt2>=0}else switch(r){case e.PolyFillType.pftEvenOdd:case e.PolyFillType.pftNonZero:return t.WindCnt2!==0;case e.PolyFillType.pftPositive:return t.WindCnt2>0;default:return t.WindCnt2<0}case e.ClipType.ctXor:if(t.WindDelta===0)switch(r){case e.PolyFillType.pftEvenOdd:case e.PolyFillType.pftNonZero:return t.WindCnt2===0;case e.PolyFillType.pftPositive:return t.WindCnt2<=0;default:return t.WindCnt2>=0}else return!0}return!0},e.Clipper.prototype.SetWindingCount=function(t){for(var n=t.PrevInAEL;n!==null&&(n.PolyTyp!==t.PolyTyp||n.WindDelta===0);)n=n.PrevInAEL;if(n===null){var r=t.PolyTyp===e.PolyType.ptSubject?this.m_SubjFillType:this.m_ClipFillType;t.WindCnt=t.WindDelta===0?r===e.PolyFillType.pftNegative?-1:1:t.WindDelta,t.WindCnt2=0,n=this.m_ActiveEdges}else if(t.WindDelta===0&&this.m_ClipType!==e.ClipType.ctUnion)t.WindCnt=1,t.WindCnt2=n.WindCnt2,n=n.NextInAEL;else if(this.IsEvenOddFillType(t)){if(t.WindDelta===0){for(var i=!0,a=n.PrevInAEL;a!==null;)a.PolyTyp===n.PolyTyp&&a.WindDelta!==0&&(i=!i),a=a.PrevInAEL;t.WindCnt=+!i}else t.WindCnt=t.WindDelta;t.WindCnt2=n.WindCnt2,n=n.NextInAEL}else t.WindCnt=n.WindCnt*n.WindDelta<0?Math.abs(n.WindCnt)>1?n.WindDelta*t.WindDelta<0?n.WindCnt:n.WindCnt+t.WindDelta:t.WindDelta===0?1:t.WindDelta:t.WindDelta===0?n.WindCnt<0?n.WindCnt-1:n.WindCnt+1:n.WindDelta*t.WindDelta<0?n.WindCnt:n.WindCnt+t.WindDelta,t.WindCnt2=n.WindCnt2,n=n.NextInAEL;if(this.IsEvenOddAltFillType(t))for(;n!==t;)n.WindDelta!==0&&(t.WindCnt2=+(t.WindCnt2===0)),n=n.NextInAEL;else for(;n!==t;)t.WindCnt2+=n.WindDelta,n=n.NextInAEL},e.Clipper.prototype.AddEdgeToSEL=function(e){this.m_SortedEdges===null?(this.m_SortedEdges=e,e.PrevInSEL=null,e.NextInSEL=null):(e.NextInSEL=this.m_SortedEdges,e.PrevInSEL=null,this.m_SortedEdges.PrevInSEL=e,this.m_SortedEdges=e)},e.Clipper.prototype.PopEdgeFromSEL=function(e){if(e.v=this.m_SortedEdges,e.v===null)return!1;var t=e.v;return this.m_SortedEdges=e.v.NextInSEL,this.m_SortedEdges!==null&&(this.m_SortedEdges.PrevInSEL=null),t.NextInSEL=null,t.PrevInSEL=null,!0},e.Clipper.prototype.CopyAELToSEL=function(){var e=this.m_ActiveEdges;for(this.m_SortedEdges=e;e!==null;)e.PrevInSEL=e.PrevInAEL,e.NextInSEL=e.NextInAEL,e=e.NextInAEL},e.Clipper.prototype.SwapPositionsInSEL=function(e,t){if((e.NextInSEL!==null||e.PrevInSEL!==null)&&(t.NextInSEL!==null||t.PrevInSEL!==null)){if(e.NextInSEL===t){var n=t.NextInSEL;n!==null&&(n.PrevInSEL=e);var r=e.PrevInSEL;r!==null&&(r.NextInSEL=t),t.PrevInSEL=r,t.NextInSEL=e,e.PrevInSEL=t,e.NextInSEL=n}else if(t.NextInSEL===e){var n=e.NextInSEL;n!==null&&(n.PrevInSEL=t);var r=t.PrevInSEL;r!==null&&(r.NextInSEL=e),e.PrevInSEL=r,e.NextInSEL=t,t.PrevInSEL=e,t.NextInSEL=n}else{var n=e.NextInSEL,r=e.PrevInSEL;e.NextInSEL=t.NextInSEL,e.NextInSEL!==null&&(e.NextInSEL.PrevInSEL=e),e.PrevInSEL=t.PrevInSEL,e.PrevInSEL!==null&&(e.PrevInSEL.NextInSEL=e),t.NextInSEL=n,t.NextInSEL!==null&&(t.NextInSEL.PrevInSEL=t),t.PrevInSEL=r,t.PrevInSEL!==null&&(t.PrevInSEL.NextInSEL=t)}e.PrevInSEL===null?this.m_SortedEdges=e:t.PrevInSEL===null&&(this.m_SortedEdges=t)}},e.Clipper.prototype.AddLocalMaxPoly=function(e,t,n){this.AddOutPt(e,n),t.WindDelta===0&&this.AddOutPt(t,n),e.OutIdx===t.OutIdx?(e.OutIdx=-1,t.OutIdx=-1):e.OutIdx<t.OutIdx?this.AppendPolygon(e,t):this.AppendPolygon(t,e)},e.Clipper.prototype.AddLocalMinPoly=function(t,n,r){var i,a,o;if(e.ClipperBase.IsHorizontal(n)||t.Dx>n.Dx?(i=this.AddOutPt(t,r),n.OutIdx=t.OutIdx,t.Side=e.EdgeSide.esLeft,n.Side=e.EdgeSide.esRight,a=t,o=a.PrevInAEL===n?n.PrevInAEL:a.PrevInAEL):(i=this.AddOutPt(n,r),t.OutIdx=n.OutIdx,t.Side=e.EdgeSide.esRight,n.Side=e.EdgeSide.esLeft,a=n,o=a.PrevInAEL===t?t.PrevInAEL:a.PrevInAEL),o!==null&&o.OutIdx>=0&&o.Top.Y<r.Y&&a.Top.Y<r.Y){var s=e.Clipper.TopX(o,r.Y),c=e.Clipper.TopX(a,r.Y);if(s===c&&a.WindDelta!==0&&o.WindDelta!==0&&e.ClipperBase.SlopesEqual5(new e.IntPoint2(s,r.Y),o.Top,new e.IntPoint2(c,r.Y),a.Top,this.m_UseFullRange)){var l=this.AddOutPt(o,r);this.AddJoin(i,l,a.Top)}}return i},e.Clipper.prototype.AddOutPt=function(t,n){if(t.OutIdx<0){var r=this.CreateOutRec();r.IsOpen=t.WindDelta===0;var i=new e.OutPt;return r.Pts=i,i.Idx=r.Idx,i.Pt.X=n.X,i.Pt.Y=n.Y,e.use_xyz&&(i.Pt.Z=n.Z),i.Next=i,i.Prev=i,r.IsOpen||this.SetHoleState(t,r),t.OutIdx=r.Idx,i}var r=this.m_PolyOuts[t.OutIdx],a=r.Pts,o=t.Side===e.EdgeSide.esLeft;if(o&&e.IntPoint.op_Equality(n,a.Pt))return a;if(!o&&e.IntPoint.op_Equality(n,a.Prev.Pt))return a.Prev;var i=new e.OutPt;return i.Idx=r.Idx,i.Pt.X=n.X,i.Pt.Y=n.Y,e.use_xyz&&(i.Pt.Z=n.Z),i.Next=a,i.Prev=a.Prev,i.Prev.Next=i,a.Prev=i,o&&(r.Pts=i),i},e.Clipper.prototype.GetLastOutPt=function(t){var n=this.m_PolyOuts[t.OutIdx];return t.Side===e.EdgeSide.esLeft?n.Pts:n.Pts.Prev},e.Clipper.prototype.SwapPoints=function(t,n){var r=new e.IntPoint1(t.Value);t.Value.X=n.Value.X,t.Value.Y=n.Value.Y,e.use_xyz&&(t.Value.Z=n.Value.Z),n.Value.X=r.X,n.Value.Y=r.Y,e.use_xyz&&(n.Value.Z=r.Z)},e.Clipper.prototype.HorzSegmentsOverlap=function(e,t,n,r){var i;return e>t&&(i=e,e=t,t=i),n>r&&(i=n,n=r,r=i),e<r&&n<t},e.Clipper.prototype.SetHoleState=function(e,t){for(var n=e.PrevInAEL,r=null;n!==null;)n.OutIdx>=0&&n.WindDelta!==0&&(r===null?r=n:r.OutIdx===n.OutIdx&&(r=null)),n=n.PrevInAEL;r===null?(t.FirstLeft=null,t.IsHole=!1):(t.FirstLeft=this.m_PolyOuts[r.OutIdx],t.IsHole=!t.FirstLeft.IsHole)},e.Clipper.prototype.GetDx=function(t,n){return t.Y===n.Y?e.ClipperBase.horizontal:(n.X-t.X)/(n.Y-t.Y)},e.Clipper.prototype.FirstIsBottomPt=function(t,n){for(var r=t.Prev;e.IntPoint.op_Equality(r.Pt,t.Pt)&&r!==t;)r=r.Prev;var i=Math.abs(this.GetDx(t.Pt,r.Pt));for(r=t.Next;e.IntPoint.op_Equality(r.Pt,t.Pt)&&r!==t;)r=r.Next;var a=Math.abs(this.GetDx(t.Pt,r.Pt));for(r=n.Prev;e.IntPoint.op_Equality(r.Pt,n.Pt)&&r!==n;)r=r.Prev;var o=Math.abs(this.GetDx(n.Pt,r.Pt));for(r=n.Next;e.IntPoint.op_Equality(r.Pt,n.Pt)&&r!==n;)r=r.Next;var s=Math.abs(this.GetDx(n.Pt,r.Pt));return Math.max(i,a)===Math.max(o,s)&&Math.min(i,a)===Math.min(o,s)?this.Area(t)>0:i>=o&&i>=s||a>=o&&a>=s},e.Clipper.prototype.GetBottomPt=function(t){for(var n=null,r=t.Next;r!==t;)r.Pt.Y>t.Pt.Y?(t=r,n=null):r.Pt.Y===t.Pt.Y&&r.Pt.X<=t.Pt.X&&(r.Pt.X<t.Pt.X?(n=null,t=r):r.Next!==t&&r.Prev!==t&&(n=r)),r=r.Next;if(n!==null)for(;n!==r;)for(this.FirstIsBottomPt(r,n)||(t=n),n=n.Next;e.IntPoint.op_Inequality(n.Pt,t.Pt);)n=n.Next;return t},e.Clipper.prototype.GetLowermostRec=function(e,t){e.BottomPt===null&&(e.BottomPt=this.GetBottomPt(e.Pts)),t.BottomPt===null&&(t.BottomPt=this.GetBottomPt(t.Pts));var n=e.BottomPt,r=t.BottomPt;return n.Pt.Y>r.Pt.Y?e:n.Pt.Y<r.Pt.Y?t:n.Pt.X<r.Pt.X?e:n.Pt.X>r.Pt.X||n.Next===n?t:r.Next===r||this.FirstIsBottomPt(n,r)?e:t},e.Clipper.prototype.OutRec1RightOfOutRec2=function(e,t){do if(e=e.FirstLeft,e===t)return!0;while(e!==null);return!1},e.Clipper.prototype.GetOutRec=function(e){for(var t=this.m_PolyOuts[e];t!==this.m_PolyOuts[t.Idx];)t=this.m_PolyOuts[t.Idx];return t},e.Clipper.prototype.AppendPolygon=function(t,n){var r=this.m_PolyOuts[t.OutIdx],i=this.m_PolyOuts[n.OutIdx],a=this.OutRec1RightOfOutRec2(r,i)?i:this.OutRec1RightOfOutRec2(i,r)?r:this.GetLowermostRec(r,i),o=r.Pts,s=o.Prev,c=i.Pts,l=c.Prev;t.Side===e.EdgeSide.esLeft?n.Side===e.EdgeSide.esLeft?(this.ReversePolyPtLinks(c),c.Next=o,o.Prev=c,s.Next=l,l.Prev=s,r.Pts=l):(l.Next=o,o.Prev=l,c.Prev=s,s.Next=c,r.Pts=c):n.Side===e.EdgeSide.esRight?(this.ReversePolyPtLinks(c),s.Next=l,l.Prev=s,c.Next=o,o.Prev=c):(s.Next=c,c.Prev=s,o.Prev=l,l.Next=o),r.BottomPt=null,a===i&&(i.FirstLeft!==r&&(r.FirstLeft=i.FirstLeft),r.IsHole=i.IsHole),i.Pts=null,i.BottomPt=null,i.FirstLeft=r;var u=t.OutIdx,d=n.OutIdx;t.OutIdx=-1,n.OutIdx=-1;for(var f=this.m_ActiveEdges;f!==null;){if(f.OutIdx===d){f.OutIdx=u,f.Side=t.Side;break}f=f.NextInAEL}i.Idx=r.Idx},e.Clipper.prototype.ReversePolyPtLinks=function(e){if(e!==null){var t=e,n;do n=t.Next,t.Next=t.Prev,t.Prev=n,t=n;while(t!==e)}},e.Clipper.SwapSides=function(e,t){var n=e.Side;e.Side=t.Side,t.Side=n},e.Clipper.SwapPolyIndexes=function(e,t){var n=e.OutIdx;e.OutIdx=t.OutIdx,t.OutIdx=n},e.Clipper.prototype.IntersectEdges=function(t,n,r){var i=t.OutIdx>=0,a=n.OutIdx>=0;if(e.use_xyz&&this.SetZ(r,t,n),e.use_lines&&(t.WindDelta===0||n.WindDelta===0)){if(t.WindDelta===0&&n.WindDelta===0)return;t.PolyTyp===n.PolyTyp&&t.WindDelta!==n.WindDelta&&this.m_ClipType===e.ClipType.ctUnion?t.WindDelta===0?a&&(this.AddOutPt(t,r),i&&(t.OutIdx=-1)):i&&(this.AddOutPt(n,r),a&&(n.OutIdx=-1)):t.PolyTyp!==n.PolyTyp&&(t.WindDelta===0&&Math.abs(n.WindCnt)===1&&(this.m_ClipType!==e.ClipType.ctUnion||n.WindCnt2===0)?(this.AddOutPt(t,r),i&&(t.OutIdx=-1)):n.WindDelta===0&&Math.abs(t.WindCnt)===1&&(this.m_ClipType!==e.ClipType.ctUnion||t.WindCnt2===0)&&(this.AddOutPt(n,r),a&&(n.OutIdx=-1)))}else{if(t.PolyTyp===n.PolyTyp){if(this.IsEvenOddFillType(t)){var o=t.WindCnt;t.WindCnt=n.WindCnt,n.WindCnt=o}else t.WindCnt+n.WindDelta===0?t.WindCnt=-t.WindCnt:t.WindCnt+=n.WindDelta,n.WindCnt-t.WindDelta===0?n.WindCnt=-n.WindCnt:n.WindCnt-=t.WindDelta}else this.IsEvenOddFillType(n)?t.WindCnt2=+(t.WindCnt2===0):t.WindCnt2+=n.WindDelta,this.IsEvenOddFillType(t)?n.WindCnt2=+(n.WindCnt2===0):n.WindCnt2-=t.WindDelta;var s,c,l,u;t.PolyTyp===e.PolyType.ptSubject?(s=this.m_SubjFillType,l=this.m_ClipFillType):(s=this.m_ClipFillType,l=this.m_SubjFillType),n.PolyTyp===e.PolyType.ptSubject?(c=this.m_SubjFillType,u=this.m_ClipFillType):(c=this.m_ClipFillType,u=this.m_SubjFillType);var d,f;switch(s){case e.PolyFillType.pftPositive:d=t.WindCnt;break;case e.PolyFillType.pftNegative:d=-t.WindCnt;break;default:d=Math.abs(t.WindCnt)}switch(c){case e.PolyFillType.pftPositive:f=n.WindCnt;break;case e.PolyFillType.pftNegative:f=-n.WindCnt;break;default:f=Math.abs(n.WindCnt)}if(i&&a)d!==0&&d!==1||f!==0&&f!==1||t.PolyTyp!==n.PolyTyp&&this.m_ClipType!==e.ClipType.ctXor?this.AddLocalMaxPoly(t,n,r):(this.AddOutPt(t,r),this.AddOutPt(n,r),e.Clipper.SwapSides(t,n),e.Clipper.SwapPolyIndexes(t,n));else if(i)(f===0||f===1)&&(this.AddOutPt(t,r),e.Clipper.SwapSides(t,n),e.Clipper.SwapPolyIndexes(t,n));else if(a)(d===0||d===1)&&(this.AddOutPt(n,r),e.Clipper.SwapSides(t,n),e.Clipper.SwapPolyIndexes(t,n));else if((d===0||d===1)&&(f===0||f===1)){var p,m;switch(l){case e.PolyFillType.pftPositive:p=t.WindCnt2;break;case e.PolyFillType.pftNegative:p=-t.WindCnt2;break;default:p=Math.abs(t.WindCnt2)}switch(u){case e.PolyFillType.pftPositive:m=n.WindCnt2;break;case e.PolyFillType.pftNegative:m=-n.WindCnt2;break;default:m=Math.abs(n.WindCnt2)}if(t.PolyTyp!==n.PolyTyp)this.AddLocalMinPoly(t,n,r);else if(d===1&&f===1)switch(this.m_ClipType){case e.ClipType.ctIntersection:p>0&&m>0&&this.AddLocalMinPoly(t,n,r);break;case e.ClipType.ctUnion:p<=0&&m<=0&&this.AddLocalMinPoly(t,n,r);break;case e.ClipType.ctDifference:(t.PolyTyp===e.PolyType.ptClip&&p>0&&m>0||t.PolyTyp===e.PolyType.ptSubject&&p<=0&&m<=0)&&this.AddLocalMinPoly(t,n,r);break;case e.ClipType.ctXor:this.AddLocalMinPoly(t,n,r)}else e.Clipper.SwapSides(t,n)}}},e.Clipper.prototype.DeleteFromSEL=function(e){var t=e.PrevInSEL,n=e.NextInSEL;(t!==null||n!==null||e===this.m_SortedEdges)&&(t===null?this.m_SortedEdges=n:t.NextInSEL=n,n!==null&&(n.PrevInSEL=t),e.NextInSEL=null,e.PrevInSEL=null)},e.Clipper.prototype.ProcessHorizontals=function(){for(var e={};this.PopEdgeFromSEL(e);)this.ProcessHorizontal(e.v)},e.Clipper.prototype.GetHorzDirection=function(t,n){t.Bot.X<t.Top.X?(n.Left=t.Bot.X,n.Right=t.Top.X,n.Dir=e.Direction.dLeftToRight):(n.Left=t.Top.X,n.Right=t.Bot.X,n.Dir=e.Direction.dRightToLeft)},e.Clipper.prototype.ProcessHorizontal=function(t){var n={Dir:null,Left:null,Right:null};this.GetHorzDirection(t,n);for(var r=n.Dir,i=n.Left,a=n.Right,o=t.WindDelta===0,s=t,c=null;s.NextInLML!==null&&e.ClipperBase.IsHorizontal(s.NextInLML);)s=s.NextInLML;s.NextInLML===null&&(c=this.GetMaximaPair(s));var l=this.m_Maxima;if(l!==null){if(r===e.Direction.dLeftToRight){for(;l!==null&&l.X<=t.Bot.X;)l=l.Next;l!==null&&l.X>=s.Top.X&&(l=null)}else{for(;l.Next!==null&&l.Next.X<t.Bot.X;)l=l.Next;l.X<=s.Top.X&&(l=null)}}for(var u=null;;){for(var d=t===s,f=this.GetNextInAEL(t,r);f!==null;){if(l!==null){if(r===e.Direction.dLeftToRight)for(;l!==null&&l.X<f.Curr.X;)t.OutIdx>=0&&!o&&this.AddOutPt(t,new e.IntPoint2(l.X,t.Bot.Y)),l=l.Next;else for(;l!==null&&l.X>f.Curr.X;)t.OutIdx>=0&&!o&&this.AddOutPt(t,new e.IntPoint2(l.X,t.Bot.Y)),l=l.Prev}if(r===e.Direction.dLeftToRight&&f.Curr.X>a||r===e.Direction.dRightToLeft&&f.Curr.X<i||f.Curr.X===t.Top.X&&t.NextInLML!==null&&f.Dx<t.NextInLML.Dx)break;if(t.OutIdx>=0&&!o){e.use_xyz&&(r===e.Direction.dLeftToRight?this.SetZ(f.Curr,t,f):this.SetZ(f.Curr,f,t)),u=this.AddOutPt(t,f.Curr);for(var p=this.m_SortedEdges;p!==null;){if(p.OutIdx>=0&&this.HorzSegmentsOverlap(t.Bot.X,t.Top.X,p.Bot.X,p.Top.X)){var m=this.GetLastOutPt(p);this.AddJoin(m,u,p.Top)}p=p.NextInSEL}this.AddGhostJoin(u,t.Bot)}if(f===c&&d){t.OutIdx>=0&&this.AddLocalMaxPoly(t,c,t.Top),this.DeleteFromAEL(t),this.DeleteFromAEL(c);return}if(r===e.Direction.dLeftToRight){var h=new e.IntPoint2(f.Curr.X,t.Curr.Y);this.IntersectEdges(t,f,h)}else{var h=new e.IntPoint2(f.Curr.X,t.Curr.Y);this.IntersectEdges(f,t,h)}var g=this.GetNextInAEL(f,r);this.SwapPositionsInAEL(t,f),f=g}if(t.NextInLML===null||!e.ClipperBase.IsHorizontal(t.NextInLML))break;t=this.UpdateEdgeIntoAEL(t),t.OutIdx>=0&&this.AddOutPt(t,t.Bot),n={Dir:r,Left:i,Right:a},this.GetHorzDirection(t,n),r=n.Dir,i=n.Left,a=n.Right}if(t.OutIdx>=0&&u===null){u=this.GetLastOutPt(t);for(var p=this.m_SortedEdges;p!==null;){if(p.OutIdx>=0&&this.HorzSegmentsOverlap(t.Bot.X,t.Top.X,p.Bot.X,p.Top.X)){var m=this.GetLastOutPt(p);this.AddJoin(m,u,p.Top)}p=p.NextInSEL}this.AddGhostJoin(u,t.Top)}if(t.NextInLML!==null){if(t.OutIdx>=0){if(u=this.AddOutPt(t,t.Top),t=this.UpdateEdgeIntoAEL(t),t.WindDelta===0)return;var _=t.PrevInAEL,g=t.NextInAEL;if(_!==null&&_.Curr.X===t.Bot.X&&_.Curr.Y===t.Bot.Y&&_.WindDelta===0&&_.OutIdx>=0&&_.Curr.Y>_.Top.Y&&e.ClipperBase.SlopesEqual3(t,_,this.m_UseFullRange)){var m=this.AddOutPt(_,t.Bot);this.AddJoin(u,m,t.Top)}else if(g!==null&&g.Curr.X===t.Bot.X&&g.Curr.Y===t.Bot.Y&&g.WindDelta!==0&&g.OutIdx>=0&&g.Curr.Y>g.Top.Y&&e.ClipperBase.SlopesEqual3(t,g,this.m_UseFullRange)){var m=this.AddOutPt(g,t.Bot);this.AddJoin(u,m,t.Top)}}else t=this.UpdateEdgeIntoAEL(t)}else t.OutIdx>=0&&this.AddOutPt(t,t.Top),this.DeleteFromAEL(t)},e.Clipper.prototype.GetNextInAEL=function(t,n){return n===e.Direction.dLeftToRight?t.NextInAEL:t.PrevInAEL},e.Clipper.prototype.IsMinima=function(e){return e!==null&&e.Prev.NextInLML!==e&&e.Next.NextInLML!==e},e.Clipper.prototype.IsMaxima=function(e,t){return e!==null&&e.Top.Y===t&&e.NextInLML===null},e.Clipper.prototype.IsIntermediate=function(e,t){return e.Top.Y===t&&e.NextInLML!==null},e.Clipper.prototype.GetMaximaPair=function(t){return e.IntPoint.op_Equality(t.Next.Top,t.Top)&&t.Next.NextInLML===null?t.Next:e.IntPoint.op_Equality(t.Prev.Top,t.Top)&&t.Prev.NextInLML===null?t.Prev:null},e.Clipper.prototype.GetMaximaPairEx=function(t){var n=this.GetMaximaPair(t);return n===null||n.OutIdx===e.ClipperBase.Skip||n.NextInAEL===n.PrevInAEL&&!e.ClipperBase.IsHorizontal(n)?null:n},e.Clipper.prototype.ProcessIntersections=function(t){if(this.m_ActiveEdges===null)return!0;try{if(this.BuildIntersectList(t),this.m_IntersectList.length===0)return!0;if(this.m_IntersectList.length===1||this.FixupIntersectionOrder())this.ProcessIntersectList();else return!1}catch{this.m_SortedEdges=null,this.m_IntersectList.length=0,e.Error(`ProcessIntersections error`)}return this.m_SortedEdges=null,!0},e.Clipper.prototype.BuildIntersectList=function(t){if(this.m_ActiveEdges!==null){var n=this.m_ActiveEdges;for(this.m_SortedEdges=n;n!==null;)n.PrevInSEL=n.PrevInAEL,n.NextInSEL=n.NextInAEL,n.Curr.X=e.Clipper.TopX(n,t),n=n.NextInAEL;for(var r=!0;r&&this.m_SortedEdges!==null;){for(r=!1,n=this.m_SortedEdges;n.NextInSEL!==null;){var i=n.NextInSEL,a=new e.IntPoint0;if(n.Curr.X>i.Curr.X){this.IntersectPoint(n,i,a),a.Y<t&&(a=new e.IntPoint2(e.Clipper.TopX(n,t),t));var o=new e.IntersectNode;o.Edge1=n,o.Edge2=i,o.Pt.X=a.X,o.Pt.Y=a.Y,e.use_xyz&&(o.Pt.Z=a.Z),this.m_IntersectList.push(o),this.SwapPositionsInSEL(n,i),r=!0}else n=i}if(n.PrevInSEL!==null)n.PrevInSEL.NextInSEL=null;else break}this.m_SortedEdges=null}},e.Clipper.prototype.EdgesAdjacent=function(e){return e.Edge1.NextInSEL===e.Edge2||e.Edge1.PrevInSEL===e.Edge2},e.Clipper.IntersectNodeSort=function(e,t){return t.Pt.Y-e.Pt.Y},e.Clipper.prototype.FixupIntersectionOrder=function(){this.m_IntersectList.sort(this.m_IntersectNodeComparer),this.CopyAELToSEL();for(var e=this.m_IntersectList.length,t=0;t<e;t++){if(!this.EdgesAdjacent(this.m_IntersectList[t])){for(var n=t+1;n<e&&!this.EdgesAdjacent(this.m_IntersectList[n]);)n++;if(n===e)return!1;var r=this.m_IntersectList[t];this.m_IntersectList[t]=this.m_IntersectList[n],this.m_IntersectList[n]=r}this.SwapPositionsInSEL(this.m_IntersectList[t].Edge1,this.m_IntersectList[t].Edge2)}return!0},e.Clipper.prototype.ProcessIntersectList=function(){for(var e=0,t=this.m_IntersectList.length;e<t;e++){var n=this.m_IntersectList[e];this.IntersectEdges(n.Edge1,n.Edge2,n.Pt),this.SwapPositionsInAEL(n.Edge1,n.Edge2)}this.m_IntersectList.length=0};var kt=function(e){return e<0?Math.ceil(e-.5):Math.round(e)},At=function(e){return e<0?Math.ceil(e-.5):Math.floor(e+.5)},jt=function(e){return e<0?-Math.round(Math.abs(e)):Math.round(e)},Mt=function(e){return e<0?(e-=.5,e<-2147483648?Math.ceil(e):e|0):(e+=.5,e>2147483647?Math.floor(e):e|0)};a.msie?e.Clipper.Round=kt:a.chromium?e.Clipper.Round=jt:a.safari?e.Clipper.Round=Mt:e.Clipper.Round=At,e.Clipper.TopX=function(t,n){return n===t.Top.Y?t.Top.X:t.Bot.X+e.Clipper.Round(t.Dx*(n-t.Bot.Y))},e.Clipper.prototype.IntersectPoint=function(t,n,r){r.X=0,r.Y=0;var i,a;if(t.Dx===n.Dx)r.Y=t.Curr.Y,r.X=e.Clipper.TopX(t,r.Y);else{if(t.Delta.X===0)r.X=t.Bot.X,e.ClipperBase.IsHorizontal(n)?r.Y=n.Bot.Y:(a=n.Bot.Y-n.Bot.X/n.Dx,r.Y=e.Clipper.Round(r.X/n.Dx+a));else if(n.Delta.X===0)r.X=n.Bot.X,e.ClipperBase.IsHorizontal(t)?r.Y=t.Bot.Y:(i=t.Bot.Y-t.Bot.X/t.Dx,r.Y=e.Clipper.Round(r.X/t.Dx+i));else{i=t.Bot.X-t.Bot.Y*t.Dx,a=n.Bot.X-n.Bot.Y*n.Dx;var o=(a-i)/(t.Dx-n.Dx);r.Y=e.Clipper.Round(o),r.X=Math.abs(t.Dx)<Math.abs(n.Dx)?e.Clipper.Round(t.Dx*o+i):e.Clipper.Round(n.Dx*o+a)}if(r.Y<t.Top.Y||r.Y<n.Top.Y){if(t.Top.Y>n.Top.Y)return r.Y=t.Top.Y,r.X=e.Clipper.TopX(n,t.Top.Y),r.X<t.Top.X;r.Y=n.Top.Y,r.X=Math.abs(t.Dx)<Math.abs(n.Dx)?e.Clipper.TopX(t,r.Y):e.Clipper.TopX(n,r.Y)}r.Y>t.Curr.Y&&(r.Y=t.Curr.Y,r.X=Math.abs(t.Dx)>Math.abs(n.Dx)?e.Clipper.TopX(n,r.Y):e.Clipper.TopX(t,r.Y))}},e.Clipper.prototype.ProcessEdgesAtTopOfScanbeam=function(t){for(var n=this.m_ActiveEdges;n!==null;){var r=this.IsMaxima(n,t);if(r){var i=this.GetMaximaPairEx(n);r=i===null||!e.ClipperBase.IsHorizontal(i)}if(r){this.StrictlySimple&&this.InsertMaxima(n.Top.X);var a=n.PrevInAEL;this.DoMaxima(n),n=a===null?this.m_ActiveEdges:a.NextInAEL}else{if(this.IsIntermediate(n,t)&&e.ClipperBase.IsHorizontal(n.NextInLML)?(n=this.UpdateEdgeIntoAEL(n),n.OutIdx>=0&&this.AddOutPt(n,n.Bot),this.AddEdgeToSEL(n)):(n.Curr.X=e.Clipper.TopX(n,t),n.Curr.Y=t),e.use_xyz&&(n.Top.Y===t?n.Curr.Z=n.Top.Z:n.Bot.Y===t?n.Curr.Z=n.Bot.Z:n.Curr.Z=0),this.StrictlySimple){var a=n.PrevInAEL;if(n.OutIdx>=0&&n.WindDelta!==0&&a!==null&&a.OutIdx>=0&&a.Curr.X===n.Curr.X&&a.WindDelta!==0){var o=new e.IntPoint1(n.Curr);e.use_xyz&&this.SetZ(o,a,n);var s=this.AddOutPt(a,o),c=this.AddOutPt(n,o);this.AddJoin(s,c,o)}}n=n.NextInAEL}}for(this.ProcessHorizontals(),this.m_Maxima=null,n=this.m_ActiveEdges;n!==null;){if(this.IsIntermediate(n,t)){var s=null;n.OutIdx>=0&&(s=this.AddOutPt(n,n.Top)),n=this.UpdateEdgeIntoAEL(n);var a=n.PrevInAEL,l=n.NextInAEL;if(a!==null&&a.Curr.X===n.Bot.X&&a.Curr.Y===n.Bot.Y&&s!==null&&a.OutIdx>=0&&a.Curr.Y===a.Top.Y&&e.ClipperBase.SlopesEqual5(n.Curr,n.Top,a.Curr,a.Top,this.m_UseFullRange)&&n.WindDelta!==0&&a.WindDelta!==0){var c=this.AddOutPt(ePrev2,n.Bot);this.AddJoin(s,c,n.Top)}else if(l!==null&&l.Curr.X===n.Bot.X&&l.Curr.Y===n.Bot.Y&&s!==null&&l.OutIdx>=0&&l.Curr.Y===l.Top.Y&&e.ClipperBase.SlopesEqual5(n.Curr,n.Top,l.Curr,l.Top,this.m_UseFullRange)&&n.WindDelta!==0&&l.WindDelta!==0){var c=this.AddOutPt(l,n.Bot);this.AddJoin(s,c,n.Top)}}n=n.NextInAEL}},e.Clipper.prototype.DoMaxima=function(t){var n=this.GetMaximaPairEx(t);if(n===null)t.OutIdx>=0&&this.AddOutPt(t,t.Top),this.DeleteFromAEL(t);else{for(var r=t.NextInAEL;r!==null&&r!==n;)this.IntersectEdges(t,r,t.Top),this.SwapPositionsInAEL(t,r),r=t.NextInAEL;t.OutIdx===-1&&n.OutIdx===-1?(this.DeleteFromAEL(t),this.DeleteFromAEL(n)):t.OutIdx>=0&&n.OutIdx>=0?(t.OutIdx>=0&&this.AddLocalMaxPoly(t,n,t.Top),this.DeleteFromAEL(t),this.DeleteFromAEL(n)):e.use_lines&&t.WindDelta===0?(t.OutIdx>=0&&(this.AddOutPt(t,t.Top),t.OutIdx=e.ClipperBase.Unassigned),this.DeleteFromAEL(t),n.OutIdx>=0&&(this.AddOutPt(n,t.Top),n.OutIdx=e.ClipperBase.Unassigned),this.DeleteFromAEL(n)):e.Error(`DoMaxima error`)}},e.Clipper.ReversePaths=function(e){for(var t=0,n=e.length;t<n;t++)e[t].reverse()},e.Clipper.Orientation=function(t){return e.Clipper.Area(t)>=0},e.Clipper.prototype.PointCount=function(e){if(e===null)return 0;var t=0,n=e;do t++,n=n.Next;while(n!==e);return t},e.Clipper.prototype.BuildResult=function(t){e.Clear(t);for(var n=0,r=this.m_PolyOuts.length;n<r;n++){var i=this.m_PolyOuts[n];if(i.Pts!==null){var a=i.Pts.Prev,o=this.PointCount(a);if(!(o<2)){for(var s=Array(o),c=0;c<o;c++)s[c]=a.Pt,a=a.Prev;t.push(s)}}}},e.Clipper.prototype.BuildResult2=function(t){t.Clear();for(var n=0,r=this.m_PolyOuts.length;n<r;n++){var i=this.m_PolyOuts[n],a=this.PointCount(i.Pts);if(!(i.IsOpen&&a<2||!i.IsOpen&&a<3)){this.FixHoleLinkage(i);var o=new e.PolyNode;t.m_AllPolys.push(o),i.PolyNode=o,o.m_polygon.length=a;for(var s=i.Pts.Prev,c=0;c<a;c++)o.m_polygon[c]=s.Pt,s=s.Prev}}for(var n=0,r=this.m_PolyOuts.length;n<r;n++){var i=this.m_PolyOuts[n];i.PolyNode!==null&&(i.IsOpen?(i.PolyNode.IsOpen=!0,t.AddChild(i.PolyNode)):i.FirstLeft!==null&&i.FirstLeft.PolyNode!==null?i.FirstLeft.PolyNode.AddChild(i.PolyNode):t.AddChild(i.PolyNode))}},e.Clipper.prototype.FixupOutPolyline=function(t){for(var n=t.Pts,r=n.Prev;n!==r;)if(n=n.Next,e.IntPoint.op_Equality(n.Pt,n.Prev.Pt)){n===r&&(r=n.Prev);var i=n.Prev;i.Next=n.Next,n.Next.Prev=i,n=i}n===n.Prev&&(t.Pts=null)},e.Clipper.prototype.FixupOutPolygon=function(t){var n=null;t.BottomPt=null;for(var r=t.Pts,i=this.PreserveCollinear||this.StrictlySimple;;){if(r.Prev===r||r.Prev===r.Next){t.Pts=null;return}if(e.IntPoint.op_Equality(r.Pt,r.Next.Pt)||e.IntPoint.op_Equality(r.Pt,r.Prev.Pt)||e.ClipperBase.SlopesEqual4(r.Prev.Pt,r.Pt,r.Next.Pt,this.m_UseFullRange)&&(!i||!this.Pt2IsBetweenPt1AndPt3(r.Prev.Pt,r.Pt,r.Next.Pt)))n=null,r.Prev.Next=r.Next,r.Next.Prev=r.Prev,r=r.Prev;else if(r===n)break;else n===null&&(n=r),r=r.Next}t.Pts=r},e.Clipper.prototype.DupOutPt=function(t,n){var r=new e.OutPt;return r.Pt.X=t.Pt.X,r.Pt.Y=t.Pt.Y,e.use_xyz&&(r.Pt.Z=t.Pt.Z),r.Idx=t.Idx,n?(r.Next=t.Next,r.Prev=t,t.Next.Prev=r,t.Next=r):(r.Prev=t.Prev,r.Next=t,t.Prev.Next=r,t.Prev=r),r},e.Clipper.prototype.GetOverlap=function(e,t,n,r,i){return e<t?n<r?(i.Left=Math.max(e,n),i.Right=Math.min(t,r)):(i.Left=Math.max(e,r),i.Right=Math.min(t,n)):n<r?(i.Left=Math.max(t,n),i.Right=Math.min(e,r)):(i.Left=Math.max(t,r),i.Right=Math.min(e,n)),i.Left<i.Right},e.Clipper.prototype.JoinHorz=function(t,n,r,i,a,o){var s=t.Pt.X>n.Pt.X?e.Direction.dRightToLeft:e.Direction.dLeftToRight,c=r.Pt.X>i.Pt.X?e.Direction.dRightToLeft:e.Direction.dLeftToRight;if(s===c)return!1;if(s===e.Direction.dLeftToRight){for(;t.Next.Pt.X<=a.X&&t.Next.Pt.X>=t.Pt.X&&t.Next.Pt.Y===a.Y;)t=t.Next;o&&t.Pt.X!==a.X&&(t=t.Next),n=this.DupOutPt(t,!o),e.IntPoint.op_Inequality(n.Pt,a)&&(t=n,t.Pt.X=a.X,t.Pt.Y=a.Y,e.use_xyz&&(t.Pt.Z=a.Z),n=this.DupOutPt(t,!o))}else{for(;t.Next.Pt.X>=a.X&&t.Next.Pt.X<=t.Pt.X&&t.Next.Pt.Y===a.Y;)t=t.Next;!o&&t.Pt.X!==a.X&&(t=t.Next),n=this.DupOutPt(t,o),e.IntPoint.op_Inequality(n.Pt,a)&&(t=n,t.Pt.X=a.X,t.Pt.Y=a.Y,e.use_xyz&&(t.Pt.Z=a.Z),n=this.DupOutPt(t,o))}if(c===e.Direction.dLeftToRight){for(;r.Next.Pt.X<=a.X&&r.Next.Pt.X>=r.Pt.X&&r.Next.Pt.Y===a.Y;)r=r.Next;o&&r.Pt.X!==a.X&&(r=r.Next),i=this.DupOutPt(r,!o),e.IntPoint.op_Inequality(i.Pt,a)&&(r=i,r.Pt.X=a.X,r.Pt.Y=a.Y,e.use_xyz&&(r.Pt.Z=a.Z),i=this.DupOutPt(r,!o))}else{for(;r.Next.Pt.X>=a.X&&r.Next.Pt.X<=r.Pt.X&&r.Next.Pt.Y===a.Y;)r=r.Next;!o&&r.Pt.X!==a.X&&(r=r.Next),i=this.DupOutPt(r,o),e.IntPoint.op_Inequality(i.Pt,a)&&(r=i,r.Pt.X=a.X,r.Pt.Y=a.Y,e.use_xyz&&(r.Pt.Z=a.Z),i=this.DupOutPt(r,o))}return s===e.Direction.dLeftToRight===o?(t.Prev=r,r.Next=t,n.Next=i,i.Prev=n):(t.Next=r,r.Prev=t,n.Prev=i,i.Next=n),!0},e.Clipper.prototype.JoinPoints=function(t,n,r){var i=t.OutPt1,a=new e.OutPt,o=t.OutPt2,s=new e.OutPt,c=t.OutPt1.Pt.Y===t.OffPt.Y;if(c&&e.IntPoint.op_Equality(t.OffPt,t.OutPt1.Pt)&&e.IntPoint.op_Equality(t.OffPt,t.OutPt2.Pt)){if(n!==r)return!1;for(a=t.OutPt1.Next;a!==i&&e.IntPoint.op_Equality(a.Pt,t.OffPt);)a=a.Next;var l=a.Pt.Y>t.OffPt.Y;for(s=t.OutPt2.Next;s!==o&&e.IntPoint.op_Equality(s.Pt,t.OffPt);)s=s.Next;return l===s.Pt.Y>t.OffPt.Y?!1:l?(a=this.DupOutPt(i,!1),s=this.DupOutPt(o,!0),i.Prev=o,o.Next=i,a.Next=s,s.Prev=a,t.OutPt1=i,t.OutPt2=a,!0):(a=this.DupOutPt(i,!0),s=this.DupOutPt(o,!1),i.Next=o,o.Prev=i,a.Prev=s,s.Next=a,t.OutPt1=i,t.OutPt2=a,!0)}if(c){for(a=i;i.Prev.Pt.Y===i.Pt.Y&&i.Prev!==a&&i.Prev!==o;)i=i.Prev;for(;a.Next.Pt.Y===a.Pt.Y&&a.Next!==i&&a.Next!==o;)a=a.Next;if(a.Next===i||a.Next===o)return!1;for(s=o;o.Prev.Pt.Y===o.Pt.Y&&o.Prev!==s&&o.Prev!==a;)o=o.Prev;for(;s.Next.Pt.Y===s.Pt.Y&&s.Next!==o&&s.Next!==i;)s=s.Next;if(s.Next===o||s.Next===i)return!1;var u={Left:null,Right:null};if(!this.GetOverlap(i.Pt.X,a.Pt.X,o.Pt.X,s.Pt.X,u))return!1;var d=u.Left,f=u.Right,p=new e.IntPoint0,m;return i.Pt.X>=d&&i.Pt.X<=f?(p.X=i.Pt.X,p.Y=i.Pt.Y,e.use_xyz&&(p.Z=i.Pt.Z),m=i.Pt.X>a.Pt.X):o.Pt.X>=d&&o.Pt.X<=f?(p.X=o.Pt.X,p.Y=o.Pt.Y,e.use_xyz&&(p.Z=o.Pt.Z),m=o.Pt.X>s.Pt.X):a.Pt.X>=d&&a.Pt.X<=f?(p.X=a.Pt.X,p.Y=a.Pt.Y,e.use_xyz&&(p.Z=a.Pt.Z),m=a.Pt.X>i.Pt.X):(p.X=s.Pt.X,p.Y=s.Pt.Y,e.use_xyz&&(p.Z=s.Pt.Z),m=s.Pt.X>o.Pt.X),t.OutPt1=i,t.OutPt2=o,this.JoinHorz(i,a,o,s,p,m)}for(a=i.Next;e.IntPoint.op_Equality(a.Pt,i.Pt)&&a!==i;)a=a.Next;var h=a.Pt.Y>i.Pt.Y||!e.ClipperBase.SlopesEqual4(i.Pt,a.Pt,t.OffPt,this.m_UseFullRange);if(h){for(a=i.Prev;e.IntPoint.op_Equality(a.Pt,i.Pt)&&a!==i;)a=a.Prev;if(a.Pt.Y>i.Pt.Y||!e.ClipperBase.SlopesEqual4(i.Pt,a.Pt,t.OffPt,this.m_UseFullRange))return!1}for(s=o.Next;e.IntPoint.op_Equality(s.Pt,o.Pt)&&s!==o;)s=s.Next;var g=s.Pt.Y>o.Pt.Y||!e.ClipperBase.SlopesEqual4(o.Pt,s.Pt,t.OffPt,this.m_UseFullRange);if(g){for(s=o.Prev;e.IntPoint.op_Equality(s.Pt,o.Pt)&&s!==o;)s=s.Prev;if(s.Pt.Y>o.Pt.Y||!e.ClipperBase.SlopesEqual4(o.Pt,s.Pt,t.OffPt,this.m_UseFullRange))return!1}return a===i||s===o||a===s||n===r&&h===g?!1:h?(a=this.DupOutPt(i,!1),s=this.DupOutPt(o,!0),i.Prev=o,o.Next=i,a.Next=s,s.Prev=a,t.OutPt1=i,t.OutPt2=a,!0):(a=this.DupOutPt(i,!0),s=this.DupOutPt(o,!1),i.Next=o,o.Prev=i,a.Prev=s,s.Next=a,t.OutPt1=i,t.OutPt2=a,!0)},e.Clipper.GetBounds=function(t){for(var n=0,r=t.length;n<r&&t[n].length===0;)n++;if(n===r)return new e.IntRect(0,0,0,0);var i=new e.IntRect;for(i.left=t[n][0].X,i.right=i.left,i.top=t[n][0].Y,i.bottom=i.top;n<r;n++)for(var a=0,o=t[n].length;a<o;a++)t[n][a].X<i.left?i.left=t[n][a].X:t[n][a].X>i.right&&(i.right=t[n][a].X),t[n][a].Y<i.top?i.top=t[n][a].Y:t[n][a].Y>i.bottom&&(i.bottom=t[n][a].Y);return i},e.Clipper.prototype.GetBounds2=function(t){var n=t,r=new e.IntRect;for(r.left=t.Pt.X,r.right=t.Pt.X,r.top=t.Pt.Y,r.bottom=t.Pt.Y,t=t.Next;t!==n;)t.Pt.X<r.left&&(r.left=t.Pt.X),t.Pt.X>r.right&&(r.right=t.Pt.X),t.Pt.Y<r.top&&(r.top=t.Pt.Y),t.Pt.Y>r.bottom&&(r.bottom=t.Pt.Y),t=t.Next;return r},e.Clipper.PointInPolygon=function(e,t){var n=0,r=t.length;if(r<3)return 0;for(var i=t[0],a=1;a<=r;++a){var o=a===r?t[0]:t[a];if(o.Y===e.Y&&(o.X===e.X||i.Y===e.Y&&o.X>e.X==i.X<e.X))return-1;if(i.Y<e.Y!=o.Y<e.Y){if(i.X>=e.X){if(o.X>e.X)n=1-n;else{var s=(i.X-e.X)*(o.Y-e.Y)-(o.X-e.X)*(i.Y-e.Y);if(s===0)return-1;s>0==o.Y>i.Y&&(n=1-n)}}else if(o.X>e.X){var s=(i.X-e.X)*(o.Y-e.Y)-(o.X-e.X)*(i.Y-e.Y);if(s===0)return-1;s>0==o.Y>i.Y&&(n=1-n)}}i=o}return n},e.Clipper.prototype.PointInPolygon=function(e,t){var n=0,r=t,i=e.X,a=e.Y,o=t.Pt.X,s=t.Pt.Y;do{t=t.Next;var c=t.Pt.X,l=t.Pt.Y;if(l===a&&(c===i||s===a&&c>i==o<i))return-1;if(s<a!=l<a){if(o>=i){if(c>i)n=1-n;else{var u=(o-i)*(l-a)-(c-i)*(s-a);if(u===0)return-1;u>0==l>s&&(n=1-n)}}else if(c>i){var u=(o-i)*(l-a)-(c-i)*(s-a);if(u===0)return-1;u>0==l>s&&(n=1-n)}}o=c,s=l}while(r!==t);return n},e.Clipper.prototype.Poly2ContainsPoly1=function(e,t){var n=e;do{var r=this.PointInPolygon(n.Pt,t);if(r>=0)return r>0;n=n.Next}while(n!==e);return!0},e.Clipper.prototype.FixupFirstLefts1=function(t,n){for(var r,i,a=0,o=this.m_PolyOuts.length;a<o;a++)r=this.m_PolyOuts[a],i=e.Clipper.ParseFirstLeft(r.FirstLeft),r.Pts!==null&&i===t&&this.Poly2ContainsPoly1(r.Pts,n.Pts)&&(r.FirstLeft=n)},e.Clipper.prototype.FixupFirstLefts2=function(t,n){for(var r=n.FirstLeft,i,a,o=0,s=this.m_PolyOuts.length;o<s;o++)i=this.m_PolyOuts[o],i.Pts!==null&&i!==n&&i!==t&&(a=e.Clipper.ParseFirstLeft(i.FirstLeft),(a===r||a===t||a===n)&&(this.Poly2ContainsPoly1(i.Pts,t.Pts)?i.FirstLeft=t:this.Poly2ContainsPoly1(i.Pts,n.Pts)?i.FirstLeft=n:(i.FirstLeft===t||i.FirstLeft===n)&&(i.FirstLeft=r)))},e.Clipper.prototype.FixupFirstLefts3=function(t,n){for(var r,i,a=0,o=this.m_PolyOuts.length;a<o;a++)r=this.m_PolyOuts[a],i=e.Clipper.ParseFirstLeft(r.FirstLeft),r.Pts!==null&&i===t&&(r.FirstLeft=n)},e.Clipper.ParseFirstLeft=function(e){for(;e!==null&&e.Pts===null;)e=e.FirstLeft;return e},e.Clipper.prototype.JoinCommonEdges=function(){for(var e=0,t=this.m_Joins.length;e<t;e++){var n=this.m_Joins[e],r=this.GetOutRec(n.OutPt1.Idx),i=this.GetOutRec(n.OutPt2.Idx);if(r.Pts!==null&&i.Pts!==null&&!(r.IsOpen||i.IsOpen)){var a=r===i?r:this.OutRec1RightOfOutRec2(r,i)?i:this.OutRec1RightOfOutRec2(i,r)?r:this.GetLowermostRec(r,i);this.JoinPoints(n,r,i)&&(r===i?(r.Pts=n.OutPt1,r.BottomPt=null,i=this.CreateOutRec(),i.Pts=n.OutPt2,this.UpdateOutPtIdxs(i),this.Poly2ContainsPoly1(i.Pts,r.Pts)?(i.IsHole=!r.IsHole,i.FirstLeft=r,this.m_UsingPolyTree&&this.FixupFirstLefts2(i,r),(i.IsHole^this.ReverseSolution)==this.Area$1(i)>0&&this.ReversePolyPtLinks(i.Pts)):this.Poly2ContainsPoly1(r.Pts,i.Pts)?(i.IsHole=r.IsHole,r.IsHole=!i.IsHole,i.FirstLeft=r.FirstLeft,r.FirstLeft=i,this.m_UsingPolyTree&&this.FixupFirstLefts2(r,i),(r.IsHole^this.ReverseSolution)==this.Area$1(r)>0&&this.ReversePolyPtLinks(r.Pts)):(i.IsHole=r.IsHole,i.FirstLeft=r.FirstLeft,this.m_UsingPolyTree&&this.FixupFirstLefts1(r,i))):(i.Pts=null,i.BottomPt=null,i.Idx=r.Idx,r.IsHole=a.IsHole,a===i&&(r.FirstLeft=i.FirstLeft),i.FirstLeft=r,this.m_UsingPolyTree&&this.FixupFirstLefts3(i,r)))}}},e.Clipper.prototype.UpdateOutPtIdxs=function(e){var t=e.Pts;do t.Idx=e.Idx,t=t.Prev;while(t!==e.Pts)},e.Clipper.prototype.DoSimplePolygons=function(){for(var t=0;t<this.m_PolyOuts.length;){var n=this.m_PolyOuts[t++],r=n.Pts;if(!(r===null||n.IsOpen))do{for(var i=r.Next;i!==n.Pts;){if(e.IntPoint.op_Equality(r.Pt,i.Pt)&&i.Next!==r&&i.Prev!==r){var a=r.Prev,o=i.Prev;r.Prev=o,o.Next=r,i.Prev=a,a.Next=i,n.Pts=r;var s=this.CreateOutRec();s.Pts=i,this.UpdateOutPtIdxs(s),this.Poly2ContainsPoly1(s.Pts,n.Pts)?(s.IsHole=!n.IsHole,s.FirstLeft=n,this.m_UsingPolyTree&&this.FixupFirstLefts2(s,n)):this.Poly2ContainsPoly1(n.Pts,s.Pts)?(s.IsHole=n.IsHole,n.IsHole=!s.IsHole,s.FirstLeft=n.FirstLeft,n.FirstLeft=s,this.m_UsingPolyTree&&this.FixupFirstLefts2(n,s)):(s.IsHole=n.IsHole,s.FirstLeft=n.FirstLeft,this.m_UsingPolyTree&&this.FixupFirstLefts1(n,s)),i=r}i=i.Next}r=r.Next}while(r!==n.Pts)}},e.Clipper.Area=function(e){if(!Array.isArray(e))return 0;var t=e.length;if(t<3)return 0;for(var n=0,r=0,i=t-1;r<t;++r)n+=(e[i].X+e[r].X)*(e[i].Y-e[r].Y),i=r;return-n*.5},e.Clipper.prototype.Area=function(e){var t=e;if(e===null)return 0;var n=0;do n+=(e.Prev.Pt.X+e.Pt.X)*(e.Prev.Pt.Y-e.Pt.Y),e=e.Next;while(e!==t);return n*.5},e.Clipper.prototype.Area$1=function(e){return this.Area(e.Pts)},e.Clipper.SimplifyPolygon=function(t,n){var r=[],i=new e.Clipper(0);return i.StrictlySimple=!0,i.AddPath(t,e.PolyType.ptSubject,!0),i.Execute(e.ClipType.ctUnion,r,n,n),r},e.Clipper.SimplifyPolygons=function(t,n){n===void 0&&(n=e.PolyFillType.pftEvenOdd);var r=[],i=new e.Clipper(0);return i.StrictlySimple=!0,i.AddPaths(t,e.PolyType.ptSubject,!0),i.Execute(e.ClipType.ctUnion,r,n,n),r},e.Clipper.DistanceSqrd=function(e,t){var n=e.X-t.X,r=e.Y-t.Y;return n*n+r*r},e.Clipper.DistanceFromLineSqrd=function(e,t,n){var r=t.Y-n.Y,i=n.X-t.X,a=r*t.X+i*t.Y;return a=r*e.X+i*e.Y-a,a*a/(r*r+i*i)},e.Clipper.SlopesNearCollinear=function(t,n,r,i){return Math.abs(t.X-n.X)>Math.abs(t.Y-n.Y)?t.X>n.X==t.X<r.X?e.Clipper.DistanceFromLineSqrd(t,n,r)<i:n.X>t.X==n.X<r.X?e.Clipper.DistanceFromLineSqrd(n,t,r)<i:e.Clipper.DistanceFromLineSqrd(r,t,n)<i:t.Y>n.Y==t.Y<r.Y?e.Clipper.DistanceFromLineSqrd(t,n,r)<i:n.Y>t.Y==n.Y<r.Y?e.Clipper.DistanceFromLineSqrd(n,t,r)<i:e.Clipper.DistanceFromLineSqrd(r,t,n)<i},e.Clipper.PointsAreClose=function(e,t,n){var r=e.X-t.X,i=e.Y-t.Y;return r*r+i*i<=n},e.Clipper.ExcludeOp=function(e){var t=e.Prev;return t.Next=e.Next,e.Next.Prev=t,t.Idx=0,t},e.Clipper.CleanPolygon=function(t,n){n===void 0&&(n=1.415);var r=t.length;if(r===0)return[];for(var i=Array(r),a=0;a<r;++a)i[a]=new e.OutPt;for(var a=0;a<r;++a)i[a].Pt=t[a],i[a].Next=i[(a+1)%r],i[a].Next.Prev=i[a],i[a].Idx=0;for(var o=n*n,s=i[0];s.Idx===0&&s.Next!==s.Prev;)e.Clipper.PointsAreClose(s.Pt,s.Prev.Pt,o)?(s=e.Clipper.ExcludeOp(s),r--):e.Clipper.PointsAreClose(s.Prev.Pt,s.Next.Pt,o)?(e.Clipper.ExcludeOp(s.Next),s=e.Clipper.ExcludeOp(s),r-=2):e.Clipper.SlopesNearCollinear(s.Prev.Pt,s.Pt,s.Next.Pt,o)?(s=e.Clipper.ExcludeOp(s),r--):(s.Idx=1,s=s.Next);r<3&&(r=0);for(var c=Array(r),a=0;a<r;++a)c[a]=new e.IntPoint1(s.Pt),s=s.Next;return i=null,c},e.Clipper.CleanPolygons=function(t,n){for(var r=Array(t.length),i=0,a=t.length;i<a;i++)r[i]=e.Clipper.CleanPolygon(t[i],n);return r},e.Clipper.Minkowski=function(t,n,r,i){var a=+!!i,o=t.length,s=n.length,c=[];if(r)for(var l=0;l<s;l++){for(var u=Array(o),d=0,f=t.length,p=t[d];d<f;d++,p=t[d])u[d]=new e.IntPoint2(n[l].X+p.X,n[l].Y+p.Y);c.push(u)}else for(var l=0;l<s;l++){for(var u=Array(o),d=0,f=t.length,p=t[d];d<f;d++,p=t[d])u[d]=new e.IntPoint2(n[l].X-p.X,n[l].Y-p.Y);c.push(u)}for(var m=[],l=0;l<s-1+a;l++)for(var d=0;d<o;d++){var h=[];h.push(c[l%s][d%o]),h.push(c[(l+1)%s][d%o]),h.push(c[(l+1)%s][(d+1)%o]),h.push(c[l%s][(d+1)%o]),e.Clipper.Orientation(h)||h.reverse(),m.push(h)}return m},e.Clipper.MinkowskiSum=function(t,n,r){if(n[0]instanceof Array){for(var i=n,a=new e.Paths,o=new e.Clipper,s=0;s<i.length;++s){var c=e.Clipper.Minkowski(t,i[s],!0,r);if(o.AddPaths(c,e.PolyType.ptSubject,!0),r){var l=e.Clipper.TranslatePath(i[s],t[0]);o.AddPath(l,e.PolyType.ptClip,!0)}}return o.Execute(e.ClipType.ctUnion,a,e.PolyFillType.pftNonZero,e.PolyFillType.pftNonZero),a}var l=n,i=e.Clipper.Minkowski(t,l,!0,r),o=new e.Clipper;return o.AddPaths(i,e.PolyType.ptSubject,!0),o.Execute(e.ClipType.ctUnion,i,e.PolyFillType.pftNonZero,e.PolyFillType.pftNonZero),i},e.Clipper.TranslatePath=function(t,n){for(var r=new e.Path,i=0;i<t.length;i++)r.push(new e.IntPoint2(t[i].X+n.X,t[i].Y+n.Y));return r},e.Clipper.MinkowskiDiff=function(t,n){var r=e.Clipper.Minkowski(t,n,!1,!0),i=new e.Clipper;return i.AddPaths(r,e.PolyType.ptSubject,!0),i.Execute(e.ClipType.ctUnion,r,e.PolyFillType.pftNonZero,e.PolyFillType.pftNonZero),r},e.Clipper.PolyTreeToPaths=function(t){var n=[];return e.Clipper.AddPolyNodeToPaths(t,e.Clipper.NodeType.ntAny,n),n},e.Clipper.AddPolyNodeToPaths=function(t,n,r){var i=!0;switch(n){case e.Clipper.NodeType.ntOpen:return;case e.Clipper.NodeType.ntClosed:i=!t.IsOpen}t.m_polygon.length>0&&i&&r.push(t.m_polygon);for(var a=0,o=t.Childs(),s=o.length,c=o[a];a<s;a++,c=o[a])e.Clipper.AddPolyNodeToPaths(c,n,r)},e.Clipper.OpenPathsFromPolyTree=function(t){for(var n=new e.Paths,r=0,i=t.ChildCount();r<i;r++)t.Childs()[r].IsOpen&&n.push(t.Childs()[r].m_polygon);return n},e.Clipper.ClosedPathsFromPolyTree=function(t){var n=new e.Paths;return e.Clipper.AddPolyNodeToPaths(t,e.Clipper.NodeType.ntClosed,n),n},z(e.Clipper,e.ClipperBase),e.Clipper.NodeType={ntAny:0,ntOpen:1,ntClosed:2},e.ClipperOffset=function(t,n){t===void 0&&(t=2),n===void 0&&(n=e.ClipperOffset.def_arc_tolerance),this.m_destPolys=new e.Paths,this.m_srcPoly=new e.Path,this.m_destPoly=new e.Path,this.m_normals=[],this.m_delta=0,this.m_sinA=0,this.m_sin=0,this.m_cos=0,this.m_miterLim=0,this.m_StepsPerRad=0,this.m_lowest=new e.IntPoint0,this.m_polyNodes=new e.PolyNode,this.MiterLimit=t,this.ArcTolerance=n,this.m_lowest.X=-1},e.ClipperOffset.two_pi=6.28318530717959,e.ClipperOffset.def_arc_tolerance=.25,e.ClipperOffset.prototype.Clear=function(){e.Clear(this.m_polyNodes.Childs()),this.m_lowest.X=-1},e.ClipperOffset.Round=e.Clipper.Round,e.ClipperOffset.prototype.AddPath=function(t,n,r){var i=t.length-1;if(!(i<0)){var a=new e.PolyNode;if(a.m_jointype=n,a.m_endtype=r,r===e.EndType.etClosedLine||r===e.EndType.etClosedPolygon)for(;i>0&&e.IntPoint.op_Equality(t[0],t[i]);)i--;a.m_polygon.push(t[0]);for(var o=0,s=0,c=1;c<=i;c++)e.IntPoint.op_Inequality(a.m_polygon[o],t[c])&&(o++,a.m_polygon.push(t[c]),(t[c].Y>a.m_polygon[s].Y||t[c].Y===a.m_polygon[s].Y&&t[c].X<a.m_polygon[s].X)&&(s=o));if(!(r===e.EndType.etClosedPolygon&&o<2)&&(this.m_polyNodes.AddChild(a),r===e.EndType.etClosedPolygon)){if(this.m_lowest.X<0)this.m_lowest=new e.IntPoint2(this.m_polyNodes.ChildCount()-1,s);else{var l=this.m_polyNodes.Childs()[this.m_lowest.X].m_polygon[this.m_lowest.Y];(a.m_polygon[s].Y>l.Y||a.m_polygon[s].Y===l.Y&&a.m_polygon[s].X<l.X)&&(this.m_lowest=new e.IntPoint2(this.m_polyNodes.ChildCount()-1,s))}}}},e.ClipperOffset.prototype.AddPaths=function(e,t,n){for(var r=0,i=e.length;r<i;r++)this.AddPath(e[r],t,n)},e.ClipperOffset.prototype.FixOrientations=function(){if(this.m_lowest.X>=0&&!e.Clipper.Orientation(this.m_polyNodes.Childs()[this.m_lowest.X].m_polygon))for(var t=0;t<this.m_polyNodes.ChildCount();t++){var n=this.m_polyNodes.Childs()[t];(n.m_endtype===e.EndType.etClosedPolygon||n.m_endtype===e.EndType.etClosedLine&&e.Clipper.Orientation(n.m_polygon))&&n.m_polygon.reverse()}else for(var t=0;t<this.m_polyNodes.ChildCount();t++){var n=this.m_polyNodes.Childs()[t];n.m_endtype===e.EndType.etClosedLine&&!e.Clipper.Orientation(n.m_polygon)&&n.m_polygon.reverse()}},e.ClipperOffset.GetUnitNormal=function(t,n){var r=n.X-t.X,i=n.Y-t.Y;if(r===0&&i===0)return new e.DoublePoint2(0,0);var a=1/Math.sqrt(r*r+i*i);return r*=a,i*=a,new e.DoublePoint2(i,-r)},e.ClipperOffset.prototype.DoOffset=function(t){if(this.m_destPolys=[],this.m_delta=t,e.ClipperBase.near_zero(t))for(var n=0;n<this.m_polyNodes.ChildCount();n++){var r=this.m_polyNodes.Childs()[n];r.m_endtype===e.EndType.etClosedPolygon&&this.m_destPolys.push(r.m_polygon)}else{this.m_miterLim=this.MiterLimit>2?2/(this.MiterLimit*this.MiterLimit):.5;var i=this.ArcTolerance<=0?e.ClipperOffset.def_arc_tolerance:this.ArcTolerance>Math.abs(t)*e.ClipperOffset.def_arc_tolerance?Math.abs(t)*e.ClipperOffset.def_arc_tolerance:this.ArcTolerance,a=3.14159265358979/Math.acos(1-i/Math.abs(t));this.m_sin=Math.sin(e.ClipperOffset.two_pi/a),this.m_cos=Math.cos(e.ClipperOffset.two_pi/a),this.m_StepsPerRad=a/e.ClipperOffset.two_pi,t<0&&(this.m_sin=-this.m_sin);for(var n=0;n<this.m_polyNodes.ChildCount();n++){var r=this.m_polyNodes.Childs()[n];this.m_srcPoly=r.m_polygon;var o=this.m_srcPoly.length;if(!(o===0||t<=0&&(o<3||r.m_endtype!==e.EndType.etClosedPolygon))){if(this.m_destPoly=[],o===1){if(r.m_jointype===e.JoinType.jtRound)for(var s=1,c=0,l=1;l<=a;l++){this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[0].X+s*t),e.ClipperOffset.Round(this.m_srcPoly[0].Y+c*t)));var u=s;s=s*this.m_cos-this.m_sin*c,c=u*this.m_sin+c*this.m_cos}else for(var s=-1,c=-1,l=0;l<4;++l)this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[0].X+s*t),e.ClipperOffset.Round(this.m_srcPoly[0].Y+c*t))),s<0?s=1:c<0?c=1:s=-1;this.m_destPolys.push(this.m_destPoly)}else{this.m_normals.length=0;for(var l=0;l<o-1;l++)this.m_normals.push(e.ClipperOffset.GetUnitNormal(this.m_srcPoly[l],this.m_srcPoly[l+1]));if(r.m_endtype===e.EndType.etClosedLine||r.m_endtype===e.EndType.etClosedPolygon?this.m_normals.push(e.ClipperOffset.GetUnitNormal(this.m_srcPoly[o-1],this.m_srcPoly[0])):this.m_normals.push(new e.DoublePoint1(this.m_normals[o-2])),r.m_endtype===e.EndType.etClosedPolygon){for(var d=o-1,l=0;l<o;l++)d=this.OffsetPoint(l,d,r.m_jointype);this.m_destPolys.push(this.m_destPoly)}else if(r.m_endtype===e.EndType.etClosedLine){for(var d=o-1,l=0;l<o;l++)d=this.OffsetPoint(l,d,r.m_jointype);this.m_destPolys.push(this.m_destPoly),this.m_destPoly=[];for(var f=this.m_normals[o-1],l=o-1;l>0;l--)this.m_normals[l]=new e.DoublePoint2(-this.m_normals[l-1].X,-this.m_normals[l-1].Y);this.m_normals[0]=new e.DoublePoint2(-f.X,-f.Y),d=0;for(var l=o-1;l>=0;l--)d=this.OffsetPoint(l,d,r.m_jointype);this.m_destPolys.push(this.m_destPoly)}else{for(var d=0,l=1;l<o-1;++l)d=this.OffsetPoint(l,d,r.m_jointype);var p;if(r.m_endtype===e.EndType.etOpenButt){var l=o-1;p=new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[l].X+this.m_normals[l].X*t),e.ClipperOffset.Round(this.m_srcPoly[l].Y+this.m_normals[l].Y*t)),this.m_destPoly.push(p),p=new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[l].X-this.m_normals[l].X*t),e.ClipperOffset.Round(this.m_srcPoly[l].Y-this.m_normals[l].Y*t)),this.m_destPoly.push(p)}else{var l=o-1;d=o-2,this.m_sinA=0,this.m_normals[l]=new e.DoublePoint2(-this.m_normals[l].X,-this.m_normals[l].Y),r.m_endtype===e.EndType.etOpenSquare?this.DoSquare(l,d):this.DoRound(l,d)}for(var l=o-1;l>0;l--)this.m_normals[l]=new e.DoublePoint2(-this.m_normals[l-1].X,-this.m_normals[l-1].Y);this.m_normals[0]=new e.DoublePoint2(-this.m_normals[1].X,-this.m_normals[1].Y),d=o-1;for(var l=d-1;l>0;--l)d=this.OffsetPoint(l,d,r.m_jointype);r.m_endtype===e.EndType.etOpenButt?(p=new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[0].X-this.m_normals[0].X*t),e.ClipperOffset.Round(this.m_srcPoly[0].Y-this.m_normals[0].Y*t)),this.m_destPoly.push(p),p=new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[0].X+this.m_normals[0].X*t),e.ClipperOffset.Round(this.m_srcPoly[0].Y+this.m_normals[0].Y*t)),this.m_destPoly.push(p)):(d=1,this.m_sinA=0,r.m_endtype===e.EndType.etOpenSquare?this.DoSquare(0,1):this.DoRound(0,1)),this.m_destPolys.push(this.m_destPoly)}}}}}},e.ClipperOffset.prototype.Execute=function(){var t=arguments;if(t[0]instanceof e.PolyTree){var n=t[0],r=t[1];n.Clear(),this.FixOrientations(),this.DoOffset(r);var i=new e.Clipper(0);if(i.AddPaths(this.m_destPolys,e.PolyType.ptSubject,!0),r>0)i.Execute(e.ClipType.ctUnion,n,e.PolyFillType.pftPositive,e.PolyFillType.pftPositive);else{var a=e.Clipper.GetBounds(this.m_destPolys),o=new e.Path;if(o.push(new e.IntPoint2(a.left-10,a.bottom+10)),o.push(new e.IntPoint2(a.right+10,a.bottom+10)),o.push(new e.IntPoint2(a.right+10,a.top-10)),o.push(new e.IntPoint2(a.left-10,a.top-10)),i.AddPath(o,e.PolyType.ptSubject,!0),i.ReverseSolution=!0,i.Execute(e.ClipType.ctUnion,n,e.PolyFillType.pftNegative,e.PolyFillType.pftNegative),n.ChildCount()===1&&n.Childs()[0].ChildCount()>0){var s=n.Childs()[0];n.Childs()[0]=s.Childs()[0],n.Childs()[0].m_Parent=n;for(var c=1;c<s.ChildCount();c++)n.AddChild(s.Childs()[c])}else n.Clear()}}else{var n=t[0],r=t[1];e.Clear(n),this.FixOrientations(),this.DoOffset(r);var i=new e.Clipper(0);if(i.AddPaths(this.m_destPolys,e.PolyType.ptSubject,!0),r>0)i.Execute(e.ClipType.ctUnion,n,e.PolyFillType.pftPositive,e.PolyFillType.pftPositive);else{var a=e.Clipper.GetBounds(this.m_destPolys),o=new e.Path;o.push(new e.IntPoint2(a.left-10,a.bottom+10)),o.push(new e.IntPoint2(a.right+10,a.bottom+10)),o.push(new e.IntPoint2(a.right+10,a.top-10)),o.push(new e.IntPoint2(a.left-10,a.top-10)),i.AddPath(o,e.PolyType.ptSubject,!0),i.ReverseSolution=!0,i.Execute(e.ClipType.ctUnion,n,e.PolyFillType.pftNegative,e.PolyFillType.pftNegative),n.length>0&&n.splice(0,1)}}},e.ClipperOffset.prototype.OffsetPoint=function(t,n,r){if(this.m_sinA=this.m_normals[n].X*this.m_normals[t].Y-this.m_normals[t].X*this.m_normals[n].Y,Math.abs(this.m_sinA*this.m_delta)<1){if(this.m_normals[n].X*this.m_normals[t].X+this.m_normals[t].Y*this.m_normals[n].Y>0)return this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+this.m_normals[n].X*this.m_delta),e.ClipperOffset.Round(this.m_srcPoly[t].Y+this.m_normals[n].Y*this.m_delta))),n}else this.m_sinA>1?this.m_sinA=1:this.m_sinA<-1&&(this.m_sinA=-1);if(this.m_sinA*this.m_delta<0)this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+this.m_normals[n].X*this.m_delta),e.ClipperOffset.Round(this.m_srcPoly[t].Y+this.m_normals[n].Y*this.m_delta))),this.m_destPoly.push(new e.IntPoint1(this.m_srcPoly[t])),this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+this.m_normals[t].X*this.m_delta),e.ClipperOffset.Round(this.m_srcPoly[t].Y+this.m_normals[t].Y*this.m_delta)));else switch(r){case e.JoinType.jtMiter:var i=1+(this.m_normals[t].X*this.m_normals[n].X+this.m_normals[t].Y*this.m_normals[n].Y);i>=this.m_miterLim?this.DoMiter(t,n,i):this.DoSquare(t,n);break;case e.JoinType.jtSquare:this.DoSquare(t,n);break;case e.JoinType.jtRound:this.DoRound(t,n)}return n=t,n},e.ClipperOffset.prototype.DoSquare=function(t,n){var r=Math.tan(Math.atan2(this.m_sinA,this.m_normals[n].X*this.m_normals[t].X+this.m_normals[n].Y*this.m_normals[t].Y)/4);this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+this.m_delta*(this.m_normals[n].X-this.m_normals[n].Y*r)),e.ClipperOffset.Round(this.m_srcPoly[t].Y+this.m_delta*(this.m_normals[n].Y+this.m_normals[n].X*r)))),this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+this.m_delta*(this.m_normals[t].X+this.m_normals[t].Y*r)),e.ClipperOffset.Round(this.m_srcPoly[t].Y+this.m_delta*(this.m_normals[t].Y-this.m_normals[t].X*r))))},e.ClipperOffset.prototype.DoMiter=function(t,n,r){var i=this.m_delta/r;this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+(this.m_normals[n].X+this.m_normals[t].X)*i),e.ClipperOffset.Round(this.m_srcPoly[t].Y+(this.m_normals[n].Y+this.m_normals[t].Y)*i)))},e.ClipperOffset.prototype.DoRound=function(t,n){for(var r=Math.atan2(this.m_sinA,this.m_normals[n].X*this.m_normals[t].X+this.m_normals[n].Y*this.m_normals[t].Y),i=Math.max(e.Cast_Int32(e.ClipperOffset.Round(this.m_StepsPerRad*Math.abs(r))),1),a=this.m_normals[n].X,o=this.m_normals[n].Y,s,c=0;c<i;++c)this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+a*this.m_delta),e.ClipperOffset.Round(this.m_srcPoly[t].Y+o*this.m_delta))),s=a,a=a*this.m_cos-this.m_sin*o,o=s*this.m_sin+o*this.m_cos;this.m_destPoly.push(new e.IntPoint2(e.ClipperOffset.Round(this.m_srcPoly[t].X+this.m_normals[t].X*this.m_delta),e.ClipperOffset.Round(this.m_srcPoly[t].Y+this.m_normals[t].Y*this.m_delta)))},e.Error=function(e){try{throw Error(e)}catch(e){alert(e.message)}},e.JS={},e.JS.AreaOfPolygon=function(t,n){return n||=1,e.Clipper.Area(t)/(n*n)},e.JS.AreaOfPolygons=function(t,n){n||=1;for(var r=0,i=0;i<t.length;i++)r+=e.Clipper.Area(t[i]);return r/(n*n)},e.JS.BoundsOfPath=function(t,n){return e.JS.BoundsOfPaths([t],n)},e.JS.BoundsOfPaths=function(t,n){n||=1;var r=e.Clipper.GetBounds(t);return r.left/=n,r.bottom/=n,r.right/=n,r.top/=n,r},e.JS.Clean=function(t,n){if(!(t instanceof Array))return[];var r=t[0]instanceof Array,t=e.JS.Clone(t);if(typeof n!=`number`||n===null)return e.Error(`Delta is not a number in Clean().`),t;if(t.length===0||t.length===1&&t[0].length===0||n<0)return t;r||(t=[t]);for(var i=t.length,a,o,s,c,l,u,d,f=[],p=0;p<i;p++)if(o=t[p],a=o.length,a!==0){if(a<3)s=o,f.push(s);else{for(s=o,c=n*n,l=o[0],u=1,d=1;d<a;d++)(o[d].X-l.X)*(o[d].X-l.X)+(o[d].Y-l.Y)*(o[d].Y-l.Y)<=c||(s[u]=o[d],l=o[d],u++);l=o[u-1],(o[0].X-l.X)*(o[0].X-l.X)+(o[0].Y-l.Y)*(o[0].Y-l.Y)<=c&&u--,u<a&&s.splice(u,a-u),s.length&&f.push(s)}}return!r&&f.length?f=f[0]:!r&&f.length===0?f=[]:r&&f.length===0&&(f=[[]]),f},e.JS.Clone=function(e){if(!(e instanceof Array)||e.length===0)return[];if(e.length===1&&e[0].length===0)return[[]];var t=e[0]instanceof Array;t||(e=[e]);var n=e.length,r,i,a,o,s=Array(n);for(i=0;i<n;i++){for(r=e[i].length,o=Array(r),a=0;a<r;a++)o[a]={X:e[i][a].X,Y:e[i][a].Y};s[i]=o}return t||(s=s[0]),s},e.JS.Lighten=function(t,n){if(!(t instanceof Array))return[];if(typeof n!=`number`||n===null)return e.Error(`Tolerance is not a number in Lighten().`),e.JS.Clone(t);if(t.length===0||t.length===1&&t[0].length===0||n<0)return e.JS.Clone(t);var r=t[0]instanceof Array;r||(t=[t]);var i,a,o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x=t.length,S=n*n,C=[];for(i=0;i<x;i++)if(o=t[i],l=o.length,l!==0){for(s=0;s<1e6;s++){for(c=[],l=o.length,o[l-1].X!==o[0].X||o[l-1].Y!==o[0].Y?(h=1,o.push({X:o[0].X,Y:o[0].Y}),l=o.length):h=0,m=[],a=0;a<l-2;a++)u=o[a],f=o[a+1],d=o[a+2],y=u.X,b=u.Y,g=d.X-y,_=d.Y-b,(g!==0||_!==0)&&(v=((f.X-y)*g+(f.Y-b)*_)/(g*g+_*_),v>1?(y=d.X,b=d.Y):v>0&&(y+=g*v,b+=_*v)),g=f.X-y,_=f.Y-b,p=g*g+_*_,p<=S&&(m[a+1]=1,a++);for(c.push({X:o[0].X,Y:o[0].Y}),a=1;a<l-1;a++)m[a]||c.push({X:o[a].X,Y:o[a].Y});if(c.push({X:o[l-1].X,Y:o[l-1].Y}),h&&o.pop(),m.length)o=c;else break}l=c.length,c[l-1].X===c[0].X&&c[l-1].Y===c[0].Y&&c.pop(),c.length>2&&C.push(c)}return r||(C=C[0]),C===void 0&&(C=[]),C},e.JS.PerimeterOfPath=function(e,t,n){if(e===void 0)return 0;var r=Math.sqrt,i=0,a,o,s=0,c=0,l=0,u=0,d=e.length;if(d<2)return 0;for(t&&(e[d]=e[0],d++);--d;)a=e[d],s=a.X,c=a.Y,o=e[d-1],l=o.X,u=o.Y,i+=r((s-l)*(s-l)+(c-u)*(c-u));return t&&e.pop(),i/n},e.JS.PerimeterOfPaths=function(t,n,r){r||=1;for(var i=0,a=0;a<t.length;a++)i+=e.JS.PerimeterOfPath(t[a],n,r);return i},e.JS.ScaleDownPath=function(e,t){var n,r;for(t||=1,n=e.length;n--;)r=e[n],r.X/=t,r.Y/=t},e.JS.ScaleDownPaths=function(e,t){var n,r,i;for(t||=1,n=e.length;n--;)for(r=e[n].length;r--;)i=e[n][r],i.X/=t,i.Y/=t},e.JS.ScaleUpPath=function(e,t){var n,r,i=Math.round;for(t||=1,n=e.length;n--;)r=e[n],r.X=i(r.X*t),r.Y=i(r.Y*t)},e.JS.ScaleUpPaths=function(e,t){var n,r,i,a=Math.round;for(t||=1,n=e.length;n--;)for(r=e[n].length;r--;)i=e[n][r],i.X=a(i.X*t),i.Y=a(i.Y*t)},e.ExPolygons=function(){return[]},e.ExPolygon=function(){this.outer=null,this.holes=null},e.JS.AddOuterPolyNodeToExPolygons=function(t,n){var r=new e.ExPolygon;r.outer=t.Contour();var i=t.Childs(),a=i.length;r.holes=Array(a);for(var o,s,c=0,l,u,d;c<a;c++)for(o=i[c],r.holes[c]=o.Contour(),l=0,u=o.Childs(),d=u.length;l<d;l++)s=u[l],e.JS.AddOuterPolyNodeToExPolygons(s,n);n.push(r)},e.JS.ExPolygonsToPaths=function(t){var n,r,i,a,o=new e.Paths;for(n=0,i=t.length;n<i;n++)for(o.push(t[n].outer),r=0,a=t[n].holes.length;r<a;r++)o.push(t[n].holes[r]);return o},e.JS.PolyTreeToExPolygons=function(t){for(var n=new e.ExPolygons,r,i=0,a=t.Childs(),o=a.length;i<o;i++)r=a[i],e.JS.AddOuterPolyNodeToExPolygons(r,n);return n}})()})))();let jr=1e3;function Mr(e){return e.map(e=>({X:Math.round(e.x*jr),Y:Math.round(e.y*jr)}))}function Nr(e){return e.map(e=>e.map(e=>({x:e.X/jr,y:e.Y/jr})))}function Pr(e,t){if(e.length===0||t<=0)return[];let n=new G.ClipperOffset(2,25);n.AddPaths(e.map(Mr),G.JoinType.jtRound,G.EndType.etClosedPolygon);let r=[];return n.Execute(r,-t*jr),Nr(r)}function Fr(e,t){if(e.length===0)return[];if(t<=0)return e;let n=new G.ClipperOffset(2,25);n.AddPaths(e.map(Mr),G.JoinType.jtRound,G.EndType.etClosedPolygon);let r=[];return n.Execute(r,t*jr),Nr(r)}function Ir(e){if(e.length===0)return[];let t=new G.Clipper;t.AddPaths(e.map(Mr),G.PolyType.ptSubject,!0);let n=[];return t.Execute(G.ClipType.ctUnion,n,G.PolyFillType.pftNonZero,G.PolyFillType.pftNonZero),Nr(n)}function Lr(e,t){if(e.length===0||t.length===0)return[];let n=new G.Clipper;n.AddPaths(e.map(Mr),G.PolyType.ptSubject,!0),n.AddPaths(t.map(Mr),G.PolyType.ptClip,!0);let r=[];return n.Execute(G.ClipType.ctIntersection,r,G.PolyFillType.pftNonZero,G.PolyFillType.pftNonZero),Nr(r)}function Rr(e,t){if(e.length===0)return[];if(t.length===0)return e;let n=new G.Clipper;n.AddPaths(e.map(Mr),G.PolyType.ptSubject,!0),n.AddPaths(t.map(Mr),G.PolyType.ptClip,!0);let r=[];return n.Execute(G.ClipType.ctDifference,r,G.PolyFillType.pftNonZero,G.PolyFillType.pftNonZero),Nr(r)}function zr(e,t,n){let r=new G.ClipperOffset(2,25);r.AddPath(Mr([e,t]),G.JoinType.jtRound,G.EndType.etOpenRound);let i=[];return r.Execute(i,n*jr),Nr(i)}function Br(e){let t=0;for(let n of e){let e=0;for(let t=0;t<n.length;t++){let r=n[t],i=n[(t+1)%n.length];e+=r.x*i.y-i.x*r.y}t+=Math.abs(e)/2}return t}function Vr(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=r.x*i.y-i.x*r.y}return t}function Hr(e,t,n){if(e.kind===`circle`){let r=t===`inside`?e.radius-n:e.radius+n;if(r<=1e-9)throw Error(`chamfer loop is smaller than the tool tip`);let i=[];for(let t=0;t<64;t++){let n=t/64*Math.PI*2;i.push({x:e.center.x+r*Math.cos(n),y:e.center.y+r*Math.sin(n)})}return[i]}if(n<=0)return[e.points];let r=Vr(e.points)>=0?e.points:[...e.points].reverse(),i=t===`inside`?Pr([r],n):Fr([r],n);if(i.length===0)throw Error(`chamfer loop is smaller than the tool tip`);return i}function Ur(e,t){if(e.loops.length===0)throw Error(`chamfer needs at least one loop`);if(e.depth<=0)throw Error(`chamfer depth must be positive`);if(e.side!==`auto`&&e.side!==`inside`&&e.side!==`outside`)throw Error(`unknown chamfer side ${String(e.side)}`);if(e.direction!==`down`&&e.direction!==`up`)throw Error(`unknown chamfer direction ${String(e.direction)}`);if(e.mode!==`add`&&e.mode!==`existing`)throw Error(`unknown chamfer mode ${String(e.mode)}`);if(t.type!==`vbit`)throw Error(`chamfer needs a V-bit — pick a chamfering/engraving bit from the library`);if(t.vAngle===void 0||t.vAngle<=0||t.vAngle>=180)throw Error(`chamfer tool needs a sane included tip angle (0–180°)`);let n=t.vAngle/2*Math.PI/180,r=(t.tipDiameter??0)/2,i=e.depth*Math.tan(n);if(e.feed<=0)throw Error(`chamfer feed must be positive`);if(e.plungeFeed<=0)throw Error(`chamfer plunge feed must be positive`);let a=[],o=null,s=0,c=0;for(let l of e.loops){let u=e.side===`auto`?l.materialOutside?`inside`:`outside`:e.side,d=e.mode===`existing`&&e.direction===`down`?e.depth*Math.tan(n):0,f=e.mode===`add`||e.direction===`down`?e.depth:0,p=r+(f>0?i:0);if(p>t.diameter/2+1e-9)throw Error(`chamfer of ${e.depth.toFixed(2)}mm needs ${p.toFixed(2)}mm of flank — the Ø${t.diameter} bit's cone is too short`);let m=e.direction===`down`?l.z-f:l.z+f,h=r+d,g=(e.direction===`down`?l.z:m)+e.safeClearance;for(let t of Hr(l,u,h)){let n=Sr(t,o),r=n[0];a.push({words:{x:r.x,y:r.y},feed:0,rapid:!0,comment:`chamfer ${e.depth.toFixed(2)}mm deep, ${i.toFixed(2)}mm wide, side ${u}`}),a.push({words:{z:g},feed:0,rapid:!0}),a.push({words:{z:m+br},feed:0,rapid:!0}),a.push({words:{z:m},feed:e.plungeFeed,comment:`plunge to chamfer tip z${m.toFixed(2)}`}),s+=br/e.plungeFeed;let l=r;for(let t=1;t<=n.length;t++){let r=n[t%n.length];a.push({words:{x:r.x,y:r.y},feed:e.feed}),s+=Math.hypot(r.x-l.x,r.y-l.y)/e.feed,l=r}a.push({words:{z:g},feed:0,rapid:!0}),o=r,c++}}return{moves:a,loops:c,width:i,estimatedMinutes:s}}let Wr=.5;function Gr(e,t){if(e.targets.length===0)throw Error(`drill needs at least one target`);if(e.plungeFeed<=0)throw Error(`plungeFeed must be positive`);let n=[],r=0;for(let t of e.targets){if(t.depth<=0)throw Error(`drill depth must be positive`);let i=t.topZ-t.depth,a=t.topZ+Wr,o=t.topZ+e.safeClearance,s=e.peckDepth>0?e.peckDepth:t.depth,c=Math.ceil(t.depth/s);n.push({words:{x:t.x,y:t.y},feed:0,rapid:!0,comment:`drill (${t.x.toFixed(2)}, ${t.y.toFixed(2)}) depth ${t.depth.toFixed(2)}mm`}),n.push({words:{z:o},feed:0,rapid:!0}),n.push({words:{z:a},feed:0,rapid:!0});for(let o=1;o<=c;o++){let s=o===c?i:t.topZ-o*t.depth/c,l=o===1?t.topZ:t.topZ-(o-1)*t.depth/c;l<t.topZ-1e-9&&n.push({words:{z:l+Wr},feed:0,rapid:!0}),n.push({words:{z:s},feed:e.plungeFeed}),r+=(l-s)/e.plungeFeed,n.push({words:{z:a},feed:0,rapid:!0})}n.push({words:{z:o},feed:0,rapid:!0})}return{moves:n,holes:e.targets.length,estimatedMinutes:r}}function Kr(e,t,n){let r=!1;for(let i of n)for(let n=0,a=i.length-1;n<i.length;a=n++){let o=i[n].y,s=i[a].y;o>t!=s>t&&e<(i[a].x-i[n].x)*(t-o)/(s-o)+i[n].x&&(r=!r)}return r}function qr(e,t,n){let r=e.length,i=t[r],a=n%i;a<0&&(a+=i);let o=0,s=r-1;for(;o<s;){let e=o+s+1>>1;t[e]<=a?o=e:s=e-1}let c=o,l=t[c+1]-t[c];if(l<=0)return e[c];let u=(a-t[c])/l,d=e[c],f=e[(c+1)%r];return{x:d.x+u*(f.x-d.x),y:d.y+u*(f.y-d.y)}}function Jr(e,t,n){let r=t[e.length],i=.05,a=[],o=null,s=0;for(let c=0;c<=r+i;c+=i){let i=Math.min(c,r),l=qr(e,t,i);Kr(l.x,l.y,n)?(o===null&&(o=i),s=i):o!==null&&(s-o>=.1&&a.push([o,s]),o=null)}return o!==null&&s-o>=.1&&a.push([o,s]),a}let Yr=.5;function Xr(e,t,n){if(e<Yr)return!1;let r=Math.min(n,e*Math.tan(3*Math.PI/180));return r>0&&Math.max(1,Math.ceil(t/r))<=24}function Zr(e,t){return e>=Yr&&t>0}function Qr(e){let t=[0];for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t.push(t[n]+Math.hypot(i.x-r.x,i.y-r.y))}return t}function $r(e,t,n,r){let i=e.length,a=t[i],o=[];for(let e=0;e<i;e++){let i=t[e];if(i>=r-1e-9)break;let s=i;for(;s<=n+1e-9;)s+=a;s>=r-1e-9||o.push({s,k:e})}o.sort((e,t)=>e.s-t.s);let s=o.map(({s:t,k:n})=>({s:t,p:e[n]}));return s.push({s:r,p:qr(e,t,r)}),s}function ei(e,t,n,r){let i=$r(e,t,r,n);return i.pop(),i.reverse(),i.push({s:r,p:qr(e,t,r)}),i}function ti(e,t){return{moves:[{words:{z:e.toZ},feed:e.feed,comment:`plunge — ${t}`}],minutes:(e.fromZ-e.toZ)/e.feed,mode:`plunge`}}function ni(e){let t=e.fromZ-e.toZ;if(t<=0)return{moves:[],minutes:0,mode:`plunge`};if(e.band<=1e-9)return ti(e,`air above a finishing level`);let n=Math.tan(3*Math.PI/180);if(e.closed){let r=e.stretch;if(r<Yr)return ti(e,`loop too short to ramp`);let i=e.bore?e.stepDown:Math.min(e.stepDown,r*n),a=Math.max(1,Math.ceil(t/i));if(!e.bore&&a>24)return ti(e,`loop too short to ramp`);let o=[];for(let n=0;n<a;n++){let i=e.sStart+n*r;for(let{s,p:c}of $r(e.loop,e.cum,i,i+r)){let l=(s-i)/r,u=n+1===a&&l>=1-1e-12?e.toZ:e.fromZ-t*(n+l)/a;o.push({words:{x:c.x,y:c.y,z:u},feed:e.feed})}}return o[0].comment=`ramp entry — helical, ${a} turn${a>1?`s`:``}`,{moves:o,minutes:a*Math.hypot(r,t/a)/e.feed,mode:`helical`}}if(e.stretch<Yr)return ti(e,`span too short to ramp`);let r=Math.min(e.stepDown,e.stretch*n),i=Math.max(2,Math.ceil(t/r));if(i%2==1&&(i+=1),i>24)return ti(e,`span too short to ramp`);let a=Math.min(e.stretch,t/(i*n));if(a<Yr)return ti(e,`span too short to ramp`);let o=[];for(let n=0;n<i;n++){let r=n%2==0,s=e.sStart+(r?0:a),c=e.sStart+(r?a:0),l=r?$r(e.loop,e.cum,s,c):ei(e.loop,e.cum,s,c);for(let{s:r,p:c}of l){let l=Math.abs(r-s)/a,u=n+1===i&&l>=1-1e-12?e.toZ:e.fromZ-t*(n+l)/i;o.push({words:{x:c.x,y:c.y,z:u},feed:e.feed})}}return o[0].comment=`ramp entry — zigzag, ${i} legs`,{moves:o,minutes:i*Math.hypot(a,t/i)/e.feed,mode:`zigzag`}}let ri=1e-4;function ii(e,t,n,r,i,a){let o=Ir([...r,...oi(i,n)]);return Br(Rr(zr(e,t,n),o))>ri?!1:Br(Rr(zr(e,t,n),a))<=ri}function ai(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=r.x*i.y-i.x*r.y}return t/2}function oi(e,t){return Fr([ai(e)<0?[...e].reverse():e],t)}function si(e,t,n={}){if(e.regions.length===0)throw Error(`pocket needs at least one region contour`);if(e.floorZ>e.topZ)throw Error(`floorZ must not be above topZ`);if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.stepOver<=0)throw Error(`stepOver must be positive`);let r=t.diameter/2,i=xr(e.topZ,e.floorZ,e.stepDown);if(Pr(e.footprint&&e.footprint.length>0?Lr(e.regions,e.footprint):e.regions,r).length===0)throw Error(`tool Ø${t.diameter} does not fit the pocket region${e.footprint?.length?` (clamped to stock)`:``}`);let a=e.travelZ??e.topZ+e.safeClearance,o=[],s=null,c=0,l=0,u=e.topZ,d={helical:0,zigzag:0,plunge:0},f=[],p=0;for(let t=0;t<1e4;t++){let i=Pr(e.regions,r+t*e.stepOver);if(e.footprint&&e.footprint.length>0&&(i=Lr(i,e.footprint)),i.length===0)break;i=i.map(e=>[...e].reverse());let a=i.filter(e=>{if(n.minLoopPerimeter===void 0)return!0;let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=Math.hypot(i.x-r.x,i.y-r.y)}return!(t<n.minLoopPerimeter)});p+=i.length-a.length,f.push(a)}let m=p*i.length;if(f.reduce((e,t)=>e+t.length,0)===1&&f[0].length===1&&i.length>1&&!e.finishingOnly&&Zr(Qr(f[0][0])[f[0][0].length],e.stepDown)){let t=f[0][0],n=t[0],r=Qr(t),s=e.topZ+br;o.push({words:{x:n.x,y:n.y},feed:0,rapid:!0,comment:`continuous descent to z${e.floorZ.toFixed(2)}`}),o.push({words:{z:a},feed:0,rapid:!0}),o.push({words:{z:s},feed:0,rapid:!0});let c=ni({loop:t,cum:r,sStart:0,stretch:r[t.length],closed:!0,band:e.topZ-e.floorZ,fromZ:s,toZ:e.floorZ,stepDown:e.stepDown,feed:e.plungeFeed,bore:!0});o.push(...c.moves),l+=c.minutes,d[c.mode]++;let u=n;for(let n=1;n<=t.length;n++){let r=t[n%t.length];o.push({words:{x:r.x,y:r.y},feed:e.feed}),l+=Math.hypot(r.x-u.x,r.y-u.y)/e.feed,u=r}return o.push({words:{z:a},feed:0,rapid:!0}),{moves:o,levels:i.length,passes:1,estimatedMinutes:l,droppedLoops:m,entries:d,links:0,continuous:1,orbits:[t]}}let h=null,g=[],_=0,v=0;for(let t of i){let i=Math.max(u,e.approachCeiling??-1/0),p=Math.max(t,i)+br;g=[];for(let u=0;u<f.length;u++)for(let m of f[u]){let f=Sr(m,s),y=f[0],b=h===t?s:null,x=n=>{!n&&h!==null&&o.push({words:{z:a},feed:0,rapid:!0}),o.push({words:{x:y.x,y:y.y},feed:0,rapid:!0,comment:`level z${t.toFixed(2)} pass ${u+1}`}),o.push({words:{z:a},feed:0,rapid:!0}),o.push({words:{z:p},feed:0,rapid:!0});let r=Qr(f),s=ni({loop:f,cum:r,sStart:0,stretch:r[f.length],closed:!0,band:e.finishingOnly?0:i-t,fromZ:p,toZ:t,stepDown:e.stepDown,feed:e.plungeFeed});o.push(...s.moves),l+=s.minutes,d[s.mode]++};if(b!==null&&(ii(b,y,r,g,f,e.regions)||(n.sweptCorridor?.(t,b,y,r)??!1)))o.push({words:{x:y.x,y:y.y},feed:e.feed,comment:`level z${t.toFixed(2)} pass ${u+1} — stay-down link`}),l+=Math.hypot(y.x-b.x,y.y-b.y)/e.feed,_++;else if(n.leadIn&&!e.finishingOnly&&!n.leadIn.sweptClear(t,y.x,y.y,r)){let i=Qr(f),s=i[f.length],c=null;for(let e=0;e<f.length;e++){if(!n.leadIn.sweptClear(t,f[e].x,f[e].y,r))continue;let a=(s-i[e])%s;(!c||a<c.back)&&(c={idx:e,back:a})}if(c&&c.back>1e-6){h!==null&&o.push({words:{z:a},feed:0,rapid:!0});let r=f[c.idx];o.push({words:{x:r.x,y:r.y},feed:0,rapid:!0,comment:`level z${t.toFixed(2)} pass ${u+1} — cleared-space lead-in`}),o.push({words:{z:a},feed:0,rapid:!0}),o.push({words:{z:Math.min(n.leadIn.zSafe,p)},feed:0,rapid:!0}),o.push({words:{z:t},feed:e.plungeFeed,comment:`lead-in plunge through swept air`});let i=r;for(let t=c.idx+1;t<f.length;t++){let n=f[t];o.push({words:{x:n.x,y:n.y},feed:e.feed}),l+=Math.hypot(n.x-i.x,n.y-i.y)/e.feed,i=n}for(let t=0;t<1;t++)o.push({words:{x:y.x,y:y.y},feed:e.feed,comment:`lead-in engage`}),l+=Math.hypot(y.x-i.x,y.y-i.y)/e.feed;v++}else x(!1)}else x(!1);let S=y;for(let t=1;t<=f.length;t++){let n=f[t%f.length];o.push({words:{x:n.x,y:n.y},feed:e.feed}),l+=Math.hypot(n.x-S.x,n.y-S.y)/e.feed,S=n}s=y,h=t,g=Ir([...g,...oi(f,r)]),c++}u=t}return h!==null&&o.push({words:{z:a},feed:0,rapid:!0}),{moves:o,levels:i.length,passes:c,estimatedMinutes:l,droppedLoops:m,entries:d,links:_,continuous:0,orbits:f.flat()}}function ci(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=r.x*i.y-i.x*r.y}return Math.abs(t)/2}function li(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=r.x*i.y-i.x*r.y}return t/2}function ui(e,t,n,r){let i=e.length,a=t[i],o=[];for(let e=0;e<i;e++){let i=t[e];if(i>=r-1e-9)break;let s=i<=n+1e-9?i+a:i;s>=r-1e-9||o.push({a:s,k:e})}o.sort((e,t)=>e.a-t.a);let s=o.map(({k:t})=>e[t]);return s.push(qr(e,t,r)),s}function di(e,t){if(e.contours.length===0)throw Error(`profile needs at least one contour`);if(e.floorZ>e.topZ)throw Error(`floorZ must not be above topZ`);if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.tabs){if(!Number.isInteger(e.tabs.count)||e.tabs.count<1)throw Error(`tab count must be an integer >= 1`);if(e.tabs.height<=0)throw Error(`tab height must be > 0`);if(e.tabs.length<=0)throw Error(`tab length must be > 0`)}let n=t.diameter/2,r;if(e.side===`online`)r=e.contours;else{let t=n+e.sideAllowance;r=e.side===`outside`?Fr(e.contours,t):Pr(e.contours,t).map(e=>li(e)>0?[...e].reverse():e)}if(r.length===0)throw Error(`profile offset leaves no path — tool too large for an inside profile?`);let i=e.tabs??null,a=i?e.floorZ+i.height:-1/0,o=i!==null&&a>=e.topZ-1e-9,s=[];o&&s.push(`tab height reaches above the cut band — no bridges left standing`);let c=r.map(t=>{let n=Qr(t),r=null;if(i&&!o){let e=n[t.length],a=Math.floor((e-1e-9)/i.length);a<1?s.push(`loop too short for tabs — cut through uncut`):(a<i.count&&s.push(`tab count clamped to ${a} on a ${e.toFixed(1)}mm loop`),r={n:Math.min(i.count,a),half:i.length/2})}let a=null;if(e.footprint&&e.footprint.length>0){let r=Lr([t],e.footprint);r.length===1&&Math.abs(ci(r[0])-ci(t))/ci(t)<1e-6||(a=Jr(t,n,e.footprint),a.length===0&&s.push(`loop lies outside the declared stock — nothing to cut there`))}return{loop:t,cum:n,perimeter:n[t.length],tabs:r,clip:a}}),l=xr(e.topZ,e.floorZ,e.stepDown),u=e.topZ+e.safeClearance,d=[],f=null,p=0,m=0,h=e.topZ,g={helical:0,zigzag:0,plunge:0},_=0,v=[],y=[];for(let t of c){let n=e.topZ+br-e.floorZ;(t.tabs===null&&t.clip===null&&!e.finishingOnly&&Xr(t.perimeter,n,e.stepDown)?y:v).push(t)}for(let t of l){let n=i!==null&&!o&&t<a-1e-9;for(let r of v){let{loop:i,cum:a,perimeter:o,tabs:s,clip:c}=r,l=[];if(c===null){if(n&&s){let e=s,t=o/e.n-2*e.half;for(let n=0;n<e.n;n++){let r=(n+.5)*o/e.n+e.half,i=r+t;l.push([r,i])}}else l=[[0,o]]}else{let e=e=>{let t=[];for(let[n,r]of e)r>o?t.push([n,o],[0,r-o]):t.push([n,r]);return t},t=e(c);if(n&&s){let n=s,r=o/n.n-2*n.half,i=[];for(let e=0;e<n.n;e++){let t=(e+.5)*o/n.n+n.half;i.push([t,t+r])}let a=e(i);for(let[e,n]of t)for(let[t,r]of a){let i=Math.max(e,t),a=Math.min(n,r);a>i+1e-9&&l.push([i,a])}}else l=t}if(l.length!==0){if(l.length===1&&l[0][0]<=1e-9&&l[0][1]>=o-1e-9){let n=r.tabs?i:Sr(i,f),a=n[0],o=`level z${t.toFixed(2)}`;d.push({words:{x:a.x,y:a.y},feed:0,rapid:!0,comment:o}),d.push({words:{z:u},feed:0,rapid:!0});let s=Math.max(t,h)+br;d.push({words:{z:s},feed:0,rapid:!0});let c=r.tabs?r.cum:Qr(n),l=ni({loop:n,cum:c,sStart:0,stretch:c[n.length],closed:!0,band:e.finishingOnly?0:h-t,fromZ:s,toZ:t,stepDown:e.stepDown,feed:e.plungeFeed});d.push(...l.moves),m+=l.minutes,g[l.mode]++;let p=a;for(let t=1;t<=n.length;t++){let r=n[t%n.length];d.push({words:{x:r.x,y:r.y},feed:e.feed}),m+=Math.hypot(r.x-p.x,r.y-p.y)/e.feed,p=r}d.push({words:{z:u},feed:0,rapid:!0}),f=a,h=t}else{let n=`level z${t.toFixed(2)}`;for(let r=0;r<l.length;r++){let[o,s]=l[r],c=qr(i,a,o);d.push({words:{x:c.x,y:c.y},feed:0,rapid:!0,comment:`${n} span ${r+1}/${l.length}`}),d.push({words:{z:u},feed:0,rapid:!0});let p=Math.max(t,h)+br;d.push({words:{z:p},feed:0,rapid:!0});let _=ni({loop:i,cum:a,sStart:o,stretch:s-o,closed:!1,band:e.finishingOnly?0:h-t,fromZ:p,toZ:t,stepDown:e.stepDown,feed:e.plungeFeed});d.push(..._.moves),m+=_.minutes,g[_.mode]++;let v=c;for(let t of ui(i,a,o,s))d.push({words:{x:t.x,y:t.y},feed:e.feed}),m+=Math.hypot(t.x-v.x,t.y-v.y)/e.feed,v=t;d.push({words:{z:u},feed:0,rapid:!0}),f=v}h=t}p++}}}for(let t of y){let n=Sr(t.loop,f),r=n[0],i=Qr(n),a=e.topZ+br;d.push({words:{x:r.x,y:r.y},feed:0,rapid:!0,comment:`continuous descent to z${e.floorZ.toFixed(2)}`}),d.push({words:{z:u},feed:0,rapid:!0}),d.push({words:{z:a},feed:0,rapid:!0});let o=ni({loop:n,cum:i,sStart:0,stretch:i[n.length],closed:!0,band:e.topZ-e.floorZ,fromZ:a,toZ:e.floorZ,stepDown:e.stepDown,feed:e.plungeFeed});d.push(...o.moves),m+=o.minutes,g[o.mode]++;let s=r;for(let t=1;t<=n.length;t++){let r=n[t%n.length];d.push({words:{x:r.x,y:r.y},feed:e.feed}),m+=Math.hypot(r.x-s.x,r.y-s.y)/e.feed,s=r}d.push({words:{z:u},feed:0,rapid:!0}),f=r,p++,_++}return{moves:d,levels:l.length,passes:p,estimatedMinutes:m,warnings:s,entries:g,continuous:_}}let fi=1.25,pi=65535,mi=2**-24,hi=Symbol(`SKIP_GENERATION`),gi={strategy:0,maxDepth:40,targetLeafSize:10,useSharedArrayBuffer:!1,setBoundingBox:!0,onProgress:null,indirect:!1,verbose:!0,range:null,[hi]:!1};function K(e,t,n){return n.min.x=t[e],n.min.y=t[e+1],n.min.z=t[e+2],n.max.x=t[e+3],n.max.y=t[e+4],n.max.z=t[e+5],n}function _i(e){let t=-1,n=-1/0;for(let r=0;r<3;r++){let i=e[r+3]-e[r];i>n&&(n=i,t=r)}return t}function vi(e,t){t.set(e)}function yi(e,t,n){let r,i;for(let a=0;a<3;a++){let o=a+3;r=e[a],i=t[a],n[a]=r<i?r:i,r=e[o],i=t[o],n[o]=r>i?r:i}}function bi(e,t,n){for(let r=0;r<3;r++){let i=t[e+2*r],a=t[e+2*r+1],o=i-a,s=i+a;o<n[r]&&(n[r]=o),s>n[r+3]&&(n[r+3]=s)}}function xi(e){let t=e[3]-e[0],n=e[4]-e[1],r=e[5]-e[2];return 2*(t*n+n*r+r*t)}function q(e,t){return t[e+15]===pi}function Si(e,t){return t[e+6]}function Ci(e,t){return t[e+14]}function J(e){return e+8}function Y(e,t){return e+t[e+6]*8}function wi(e,t){return t[e+7]}function X(e){return e}function Ti(e,t,n,r,i){let a=1/0,o=1/0,s=1/0,c=-1/0,l=-1/0,u=-1/0,d=1/0,f=1/0,p=1/0,m=-1/0,h=-1/0,g=-1/0,_=e.offset||0;for(let r=(t-_)*6,i=(t+n-_)*6;r<i;r+=6){let t=e[r+0],n=e[r+1],i=t-n,_=t+n;i<a&&(a=i),_>c&&(c=_),t<d&&(d=t),t>m&&(m=t);let v=e[r+2],y=e[r+3],b=v-y,x=v+y;b<o&&(o=b),x>l&&(l=x),v<f&&(f=v),v>h&&(h=v);let S=e[r+4],C=e[r+5],w=S-C,T=S+C;w<s&&(s=w),T>u&&(u=T),S<p&&(p=S),S>g&&(g=S)}r[0]=a,r[1]=o,r[2]=s,r[3]=c,r[4]=l,r[5]=u,i[0]=d,i[1]=f,i[2]=p,i[3]=m,i[4]=h,i[5]=g}let Ei=(e,t)=>e.candidate-t.candidate,Di=/* @__PURE__ */ Array(32).fill().map(()=>({count:0,bounds:/* @__PURE__ */ new Float32Array(6),rightCacheBounds:/* @__PURE__ */ new Float32Array(6),leftCacheBounds:/* @__PURE__ */ new Float32Array(6),candidate:0})),Oi=/* @__PURE__ */ new Float32Array(6);function ki(e,t,n,r,i,a){let o=-1,s=0;if(a===0)o=_i(t),o!==-1&&(s=(t[o]+t[o+3])/2);else if(a===1)o=_i(e),o!==-1&&(s=Ai(n,r,i,o));else if(a===2){let a=xi(e),c=fi*i,l=n.offset||0,u=(r-l)*6,d=(r+i-l)*6;for(let e=0;e<3;e++){let r=t[e],l=(t[e+3]-r)/32;if(i<8){let t=[...Di];t.length=i;let r=0;for(let i=u;i<d;i+=6,r++){let a=t[r];a.candidate=n[i+2*e],a.count=0;let{bounds:o,leftCacheBounds:s,rightCacheBounds:c}=a;for(let e=0;e<3;e++)c[e]=1/0,c[e+3]=-1/0,s[e]=1/0,s[e+3]=-1/0,o[e]=1/0,o[e+3]=-1/0;bi(i,n,o)}t.sort(Ei);let l=i;for(let e=0;e<l;e++){let n=t[e];for(;e+1<l&&t[e+1].candidate===n.candidate;)t.splice(e+1,1),l--}for(let r=u;r<d;r+=6){let i=n[r+2*e];for(let e=0;e<l;e++){let a=t[e];i>=a.candidate?bi(r,n,a.rightCacheBounds):(bi(r,n,a.leftCacheBounds),a.count++)}}for(let n=0;n<l;n++){let r=t[n],l=r.count,u=i-r.count,d=r.leftCacheBounds,f=r.rightCacheBounds,p=0;l!==0&&(p=xi(d)/a);let m=0;u!==0&&(m=xi(f)/a);let h=1+fi*(p*l+m*u);h<c&&(o=e,c=h,s=r.candidate)}}else{for(let e=0;e<32;e++){let t=Di[e];t.count=0,t.candidate=r+l+e*l;let n=t.bounds;for(let e=0;e<3;e++)n[e]=1/0,n[e+3]=-1/0}for(let t=u;t<d;t+=6){let i=~~((n[t+2*e]-r)/l);i>=32&&(i=31);let a=Di[i];a.count++,bi(t,n,a.bounds)}let t=Di[31];vi(t.bounds,t.rightCacheBounds);for(let e=30;e>=0;e--){let t=Di[e],n=Di[e+1];yi(t.bounds,n.rightCacheBounds,t.rightCacheBounds)}let f=0;for(let t=0;t<31;t++){let n=Di[t],r=n.count,l=n.bounds,u=Di[t+1].rightCacheBounds;r!==0&&(f===0?vi(l,Oi):yi(l,Oi,Oi)),f+=r;let d=0,p=0;f!==0&&(d=xi(Oi)/a);let m=i-f;m!==0&&(p=xi(u)/a);let h=1+fi*(d*f+p*m);h<c&&(o=e,c=h,s=n.candidate)}}}}else console.warn(`BVH: Invalid build strategy value ${a} used.`);return{axis:o,pos:s}}function Ai(e,t,n,r){let i=0,a=e.offset;for(let o=t,s=t+n;o<s;o++)i+=e[(o-a)*6+r*2];return i/n}var ji=class{constructor(){this.boundingData=/* @__PURE__ */ new Float32Array(6)}};function Mi(e,t,n,r,i,a){let o=r,s=r+i-1,c=a.pos,l=a.axis*2,u=n.offset||0;for(;;){for(;o<=s&&n[(o-u)*6+l]<c;)o++;for(;o<=s&&n[(s-u)*6+l]>=c;)s--;if(o<s){for(let n=0;n<t;n++){let r=e[o*t+n];e[o*t+n]=e[s*t+n],e[s*t+n]=r}for(let e=0;e<6;e++){let t=o-u,r=s-u,i=n[t*6+e];n[t*6+e]=n[r*6+e],n[r*6+e]=i}o++,s--}else return o}}let Ni,Pi,Fi,Ii,Li=2**32;function Ri(e){return`count`in e?1:1+Ri(e.left)+Ri(e.right)}function zi(e,t,n){return Ni=new Float32Array(n),Pi=new Uint32Array(n),Fi=new Uint16Array(n),Ii=new Uint8Array(n),Bi(e,t)}function Bi(e,t){let n=e/4,r=e/2,i=`count`in t,a=t.boundingData;for(let e=0;e<6;e++)Ni[n+e]=a[e];if(i)return t.buffer?(Ii.set(new Uint8Array(t.buffer),e),e+t.buffer.byteLength):(Pi[n+6]=t.offset,Fi[r+14]=t.count,Fi[r+15]=pi,e+32);{let{left:r,right:i,splitAxis:a}=t,o=Bi(e+32,r),s=e/32,c=o/32-s;if(c>Li)throw Error(`MeshBVH: Cannot store relative child node offset greater than 32 bits.`);return Pi[n+6]=c,Pi[n+7]=a,Bi(o,i)}}function Vi(e,t,n,r,i,a){let{maxDepth:o,verbose:s,targetLeafSize:c,_strictLeafSize:l=1/0,strategy:u,onProgress:d}=i,f=e.primitiveBuffer,p=e.primitiveBufferStride,m=/* @__PURE__ */ new Float32Array(6),h=!1,g=new ji;return Ti(t,n,r,g.boundingData,m),v(g,n,r,m),g;function _(e){d&&d((e-a.offset)/a.count)}function v(e,n,r,i=null,a=0){!h&&a>=o&&(h=!0,s&&console.warn(`BVH: Max depth of ${o} reached when generating BVH. Consider increasing maxDepth.`));let d=r>l;if(r<=c&&!d||a>=o)return _(n+r),e.offset=n,e.count=r,e;let g=ki(e.boundingData,i,t,n,r,u),y=g.axis===-1?-1:Mi(f,p,t,n,r,g);if(g.axis===-1||y===n||y===n+r){if(!d)return _(n+r),e.offset=n,e.count=r,e;g.axis=Math.max(0,_i(e.boundingData)),y=n+Math.max(1,Math.floor(r/2))}e.splitAxis=g.axis;let b=new ji,x=n,S=y-n;e.left=b,Ti(t,x,S,b.boundingData,m),v(b,x,S,m,a+1);let C=new ji,w=y,T=r-S;return e.right=C,Ti(t,w,T,C.boundingData,m),v(C,w,T,m,a+1),e}}function Hi(e,t){let n=t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,r=e.getRootRanges(t.range),i=r[0],a=r[r.length-1],o={offset:i.offset,count:a.offset+a.count-i.offset},s=new Float32Array(6*o.count);s.offset=o.offset,e.computePrimitiveBounds(o.offset,o.count,s),e._roots=r.map(r=>{let i=Vi(e,s,r.offset,r.count,t,o),a=Ri(i),c=new n(32*a);return zi(0,i,c),c})}var Ui=class{constructor(e){this._getNewPrimitive=e,this._primitives=[]}getPrimitive(){let e=this._primitives;return e.length===0?this._getNewPrimitive():e.pop()}releasePrimitive(e){this._primitives.push(e)}};let Z=/* @__PURE__ */ new class{constructor(){this.float32Array=null,this.uint16Array=null,this.uint32Array=null;let e=[],t=null;this.setBuffer=n=>{t&&e.push(t),t=n,this.float32Array=new Float32Array(n),this.uint16Array=new Uint16Array(n),this.uint32Array=new Uint32Array(n)},this.clearBuffer=()=>{t=null,this.float32Array=null,this.uint16Array=null,this.uint32Array=null,e.length!==0&&this.setBuffer(e.pop())}}},Wi,Gi,Ki=[],qi=/* @__PURE__ */ new Ui(()=>new F);function Ji(e,t,n,r,i,a){Wi=qi.getPrimitive(),Gi=qi.getPrimitive(),Ki.push(Wi,Gi),Z.setBuffer(e._roots[t]);let o=Yi(0,e.geometry,n,r,i,a);Z.clearBuffer(),qi.releasePrimitive(Wi),qi.releasePrimitive(Gi),Ki.pop(),Ki.pop();let s=Ki.length;return s>0&&(Gi=Ki[s-1],Wi=Ki[s-2]),o}function Yi(e,t,n,r,i=null,a=0,o=0){let{float32Array:s,uint16Array:c,uint32Array:l}=Z,u=e*2;if(q(u,c)){let t=Si(e,l),n=Ci(u,c);return K(X(e),s,Wi),r(t,n,!1,o,a+e/8,Wi)}{let u=J(e),p=Y(e,l),m=u,h=p,g,_,v,y;if(i&&(v=Wi,y=Gi,K(X(m),s,v),K(X(h),s,y),g=i(v),_=i(y),_<g)){m=p,h=u;let e=g;g=_,_=e,v=y}v||(v=Wi,K(X(m),s,v));let b=q(m*2,c),x=n(v,b,g,o+1,a+m/8),S;if(x===2){let e=d(m);S=r(e,f(m)-e,!0,o+1,a+m/8,v)}else S=x&&Yi(m,t,n,r,i,a,o+1);if(S)return!0;y=Gi,K(X(h),s,y);let C=q(h*2,c),w=n(y,C,_,o+1,a+h/8),T;if(w===2){let e=d(h);T=r(e,f(h)-e,!0,o+1,a+h/8,y)}else T=w&&Yi(h,t,n,r,i,a,o+1);return!!T;function d(e){let{uint16Array:t,uint32Array:n}=Z,r=e*2;for(;!q(r,t);)e=J(e),r=e*2;return Si(e,n)}function f(e){let{uint16Array:t,uint32Array:n}=Z,r=e*2;for(;!q(r,t);)e=Y(e,n),r=e*2;return Si(e,n)+Ci(r,t)}}}let Xi=/* @__PURE__ */ new Z.constructor,Zi=/* @__PURE__ */ new Z.constructor,Qi=/* @__PURE__ */ new Ui(()=>new F),$i=/* @__PURE__ */ new F,ea=/* @__PURE__ */ new F,ta=/* @__PURE__ */ new F,na=/* @__PURE__ */ new F,ra=!1;function ia(e,t,n,r){if(ra)throw Error(`MeshBVH: Recursive calls to bvhcast not supported.`);ra=!0;let i=e._roots,a=t._roots,o,s=0,c=0,l=new Le().copy(n).invert();for(let e=0,t=i.length;e<t;e++){Xi.setBuffer(i[e]),c=0;let t=Qi.getPrimitive();K(X(0),Xi.float32Array,t),t.applyMatrix4(l);for(let e=0,i=a.length;e<i&&(Zi.setBuffer(a[e]),o=aa(0,0,n,l,r,s,c,0,0,t),Zi.clearBuffer(),c+=a[e].byteLength/32,!o);e++);if(Qi.releasePrimitive(t),Xi.clearBuffer(),s+=i[e].byteLength/32,o)break}return ra=!1,o}function aa(e,t,n,r,i,a=0,o=0,s=0,c=0,l=null,u=!1){let d,f;u?(d=Zi,f=Xi):(d=Xi,f=Zi);let p=d.float32Array,m=d.uint32Array,h=d.uint16Array,g=f.float32Array,_=f.uint32Array,v=f.uint16Array,y=e*2,b=t*2,x=q(y,h),S=q(b,v),C=!1;if(S&&x)C=u?i(Si(t,_),Ci(t*2,v),Si(e,m),Ci(e*2,h),c,o+t/8,s,a+e/8):i(Si(e,m),Ci(e*2,h),Si(t,_),Ci(t*2,v),s,a+e/8,c,o+t/8);else if(S){let l=Qi.getPrimitive();K(X(t),g,l),l.applyMatrix4(n);let d=J(e),f=Y(e,m);K(X(d),p,$i),K(X(f),p,ea);let h=l.intersectsBox($i),_=l.intersectsBox(ea);C=h&&aa(t,d,r,n,i,o,a,c,s+1,l,!u)||_&&aa(t,f,r,n,i,o,a,c,s+1,l,!u),Qi.releasePrimitive(l)}else{let d=J(t),f=Y(t,_);K(X(d),g,ta),K(X(f),g,na);let h=l.intersectsBox(ta),v=l.intersectsBox(na);if(h&&v)C=aa(e,d,n,r,i,a,o,s,c+1,l,u)||aa(e,f,n,r,i,a,o,s,c+1,l,u);else if(h){if(x)C=aa(e,d,n,r,i,a,o,s,c+1,l,u);else{let t=Qi.getPrimitive();t.copy(ta).applyMatrix4(n);let l=J(e),f=Y(e,m);K(X(l),p,$i),K(X(f),p,ea);let h=t.intersectsBox($i),g=t.intersectsBox(ea);C=h&&aa(d,l,r,n,i,o,a,c,s+1,t,!u)||g&&aa(d,f,r,n,i,o,a,c,s+1,t,!u),Qi.releasePrimitive(t)}}else if(v){if(x)C=aa(e,f,n,r,i,a,o,s,c+1,l,u);else{let t=Qi.getPrimitive();t.copy(na).applyMatrix4(n);let l=J(e),d=Y(e,m);K(X(l),p,$i),K(X(d),p,ea);let h=t.intersectsBox($i),g=t.intersectsBox(ea);C=h&&aa(f,l,r,n,i,o,a,c,s+1,t,!u)||g&&aa(f,d,r,n,i,o,a,c,s+1,t,!u),Qi.releasePrimitive(t)}}}return C}let oa=new class{constructor(){let e=null,t=null,n=null,r=!1;this.root=null,this.buffer=null,this.uint32Array=null,this.uint16Array=null,this.setBVH=(i,a)=>{if(r)throw Error(`BVHTraversalHelper: cannot call setBVH during an active traversal.`);this.root=a,this.buffer=e=i._roots[a],this.uint16Array=n=new Uint16Array(e),this.uint32Array=t=new Uint32Array(e)},this.reset=()=>{this.root=null,this.buffer=e=null,this.uint16Array=n=null,this.uint32Array=t=null},this.getRangeStart=e=>{let r=e*2;for(;!q(r,n);)e=J(e),r=e*2;return Si(e,t)},this.getRangeEnd=e=>{let r=e*2;for(;!q(r,n);)e=Y(e,t),r=e*2;return Si(e,t)+Ci(r,n)};let i=(e,r,a)=>{let o=q(r*2,n);if(!e(a,o,r)&&!o){let n=J(r),o=Y(r,t);i(e,n,a+1),i(e,o,a+1)}};this.traverseBuffer=e=>{if(r)throw Error(`BVHTraversalHelper: cannot start a traversal during an active traversal.`);r=!0;try{i(e,0,0)}finally{r=!1}},this.traverse=r=>{this.traverseBuffer((i,a,o)=>{if(a){let s=o*2,c=t[o+6],l=n[s+14];return r(i,a,new Float32Array(e,o*4,6),c,l)}{let n=wi(o,t);return r(i,a,new Float32Array(e,o*4,6),n)}})}}},sa=/* @__PURE__ */ new F,ca=/* @__PURE__ */ new Float32Array(6);var la=class{constructor(){this._roots=null,this.primitiveBuffer=null,this.primitiveBufferStride=null}init(e){e={...gi,...e},`maxLeafSize`in e&&(console.warn(`BVH: "maxLeafSize" option has been deprecated. Use "targetLeafSize", instead.`),e={...e,targetLeafSize:e.maxLeafSize}),Hi(this,e)}getRootRanges(){throw Error(`BVH: getRootRanges() not implemented`)}writePrimitiveBounds(){throw Error(`BVH: writePrimitiveBounds() not implemented`)}writePrimitiveRangeBounds(e,t,n,r){let i=1/0,a=1/0,o=1/0,s=-1/0,c=-1/0,l=-1/0;for(let n=e,r=e+t;n<r;n++){this.writePrimitiveBounds(n,ca,0);let[e,t,r,u,d,f]=ca;e<i&&(i=e),u>s&&(s=u),t<a&&(a=t),d>c&&(c=d),r<o&&(o=r),f>l&&(l=f)}return n[r+0]=i,n[r+1]=a,n[r+2]=o,n[r+3]=s,n[r+4]=c,n[r+5]=l,n}computePrimitiveBounds(e,t,n){let r=n.offset||0;for(let i=e,a=e+t;i<a;i++){this.writePrimitiveBounds(i,ca,0);let[e,t,a,o,s,c]=ca,l=(e+o)/2,u=(t+s)/2,d=(a+c)/2,f=(o-e)/2,p=(s-t)/2,m=(c-a)/2,h=(i-r)*6;n[h+0]=l,n[h+1]=f+(Math.abs(l)+f)*mi,n[h+2]=u,n[h+3]=p+(Math.abs(u)+p)*mi,n[h+4]=d,n[h+5]=m+(Math.abs(d)+m)*mi}return n}shiftPrimitiveOffsets(e){let t=this._indirectBuffer;if(t)for(let n=0,r=t.length;n<r;n++)t[n]+=e;else{let t=this._roots;for(let n=0;n<t.length;n++){let r=t[n],i=new Uint32Array(r),a=new Uint16Array(r),o=r.byteLength/32;for(let t=0;t<o;t++){let n=8*t;q(2*n,a)&&(i[n+6]+=e)}}}}traverse(e,t=0){oa.setBVH(this,t),oa.traverse(e),oa.reset()}refit(){let e=this._roots;for(let t=0,n=e.length;t<n;t++){let n=e[t],r=new Uint32Array(n),i=new Uint16Array(n),a=new Float32Array(n),o=n.byteLength/32;for(let e=o-1;e>=0;e--){let t=e*8,n=t*2;if(q(n,i)){let e=Si(t,r),o=Ci(n,i);this.writePrimitiveRangeBounds(e,o,ca,0),a.set(ca,t)}else{let e=J(t),n=Y(t,r);for(let r=0;r<3;r++){let i=a[e+r],o=a[e+r+3],s=a[n+r],c=a[n+r+3];a[t+r]=i<s?i:s,a[t+r+3]=o>c?o:c}}}}}getBoundingBox(e){return e.makeEmpty(),this._roots.forEach(t=>{K(0,new Float32Array(t),sa),e.union(sa)}),e}shapecast(e){let{boundsTraverseOrder:t,intersectsBounds:n,intersectsRange:r,intersectsPrimitive:i,scratchPrimitive:a,iterate:o}=e;if(r&&i){let e=r;r=(t,n,r,s,c)=>e(t,n,r,s,c)?!0:o(t,n,this,i,r,s,a)}else r||=i?(e,t,n,r)=>o(e,t,this,i,n,r,a):(e,t,n)=>n;let s=!1,c=0,l=this._roots;for(let e=0,i=l.length;e<i;e++){let i=l[e];if(s=Ji(this,e,n,r,t,c),s)break;c+=i.byteLength/32}return s}bvhcast(e,t,n){let{intersectsRanges:r}=n;return ia(this,e,t,r)}};function ua(){return typeof SharedArrayBuffer<`u`}function da(e){return e.index?e.index.count:e.attributes.position.count}function fa(e){return da(e)/3}function pa(e,t=ArrayBuffer){return e>65535?new Uint32Array(new t(4*e)):new Uint16Array(new t(2*e))}function ma(e,t){if(!e.index){let n=e.attributes.position.count,r=pa(n,t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer);e.setIndex(new At(r,1));for(let e=0;e<n;e++)r[e]=e}}function ha(e,t,n){let r=da(e)/n,i=t||e.drawRange,a=i.start/n,o=(i.start+i.count)/n,s=Math.max(0,a),c=Math.min(r,o)-s;return{offset:Math.floor(s),count:Math.floor(c)}}function ga(e,t){return e.groups.map(e=>({offset:e.start/t,count:e.count/t}))}function _a(e,t,n){let r=ha(e,t,n),i=ga(e,n);if(!i.length)return[r];let a=[],o=r.offset,s=r.offset+r.count,c=da(e)/n,l=[];for(let e of i){let{offset:t,count:n}=e,r=t,i=t+(isFinite(n)?n:c-t);r<s&&i>o&&(l.push({pos:Math.max(o,r),isStart:!0}),l.push({pos:Math.min(s,i),isStart:!1}))}l.sort((e,t)=>e.pos===t.pos?e.type===`end`?-1:1:e.pos-t.pos);let u=0,d=null;for(let e of l){let t=e.pos;u!==0&&t!==d&&a.push({offset:d,count:t-d}),u+=e.isStart?1:-1,d=t}return a}function va(e,t){let n=e[e.length-1],r=n.offset+n.count>2**16,i=e.reduce((e,t)=>e+t.count,0),a=r?4:2,o=t?new SharedArrayBuffer(i*a):new ArrayBuffer(i*a),s=r?new Uint32Array(o):new Uint16Array(o),c=0;for(let t=0;t<e.length;t++){let{offset:n,count:r}=e[t];for(let e=0;e<r;e++)s[c+e]=n+e;c+=r}return s}var ya=class extends la{get indirect(){return!!this._indirectBuffer}get primitiveStride(){return null}get primitiveBufferStride(){return this.indirect?1:this.primitiveStride}set primitiveBufferStride(e){}get primitiveBuffer(){return this.indirect?this._indirectBuffer:this.geometry.index.array}set primitiveBuffer(e){}constructor(e,t={}){if(!e.isBufferGeometry)throw Error(`BVH: Only BufferGeometries are supported.`);if(e.index&&e.index.isInterleavedBufferAttribute)throw Error(`BVH: InterleavedBufferAttribute is not supported for the index attribute.`);if(t.useSharedArrayBuffer&&!ua())throw Error(`BVH: SharedArrayBuffer is not available.`);super(),this.geometry=e,this.resolvePrimitiveIndex=t.indirect?e=>this._indirectBuffer[e]:e=>e,this.primitiveBuffer=null,this.primitiveBufferStride=null,this._indirectBuffer=null,t={...gi,...t},t[hi]||this.init(t)}init(e){let{geometry:t,primitiveStride:n}=this;if(e.indirect){let r=va(_a(t,e.range,n),e.useSharedArrayBuffer);this._indirectBuffer=r}else ma(t,e);super.init(e),!t.boundingBox&&e.setBoundingBox&&(t.boundingBox=this.getBoundingBox(new F))}getRootRanges(e){return this.indirect?[{offset:0,count:this._indirectBuffer.length}]:_a(this.geometry,e,this.primitiveStride)}raycastObject3D(){throw Error(`BVH: raycastObject3D() not implemented`)}},ba=class{constructor(){this.min=1/0,this.max=-1/0}setFromPointsField(e,t){let n=1/0,r=-1/0;for(let i=0,a=e.length;i<a;i++){let a=e[i][t];n=a<n?a:n,r=a>r?a:r}this.min=n,this.max=r}setFromPoints(e,t){let n=1/0,r=-1/0;for(let i=0,a=t.length;i<a;i++){let a=t[i],o=e.dot(a);n=o<n?o:n,r=o>r?o:r}this.min=n,this.max=r}isSeparated(e){return this.min>e.max||e.min>this.max}};ba.prototype.setFromBox=(function(){let e=/* @__PURE__ */ new P;return function(t,n){let r=n.min,i=n.max,a=1/0,o=-1/0;for(let n=0;n<=1;n++)for(let s=0;s<=1;s++)for(let c=0;c<=1;c++){e.x=r.x*n+i.x*(1-n),e.y=r.y*s+i.y*(1-s),e.z=r.z*c+i.z*(1-c);let l=t.dot(e);a=Math.min(l,a),o=Math.max(l,o)}this.min=a,this.max=o}})();let xa=(function(){let e=/* @__PURE__ */ new P,t=/* @__PURE__ */ new P,n=/* @__PURE__ */ new P;return function(r,i,a){let o=r.start,s=e,c=i.start,l=t;n.subVectors(o,c),e.subVectors(r.end,r.start),t.subVectors(i.end,i.start);let u=n.dot(l),d=l.dot(s),f=l.dot(l),p=n.dot(s),m=s.dot(s)*f-d*d,h,g;h=m===0?0:(u*d-p*f)/m,g=(u+h*d)/f,a.x=h,a.y=g}})(),Sa=(function(){let e=/* @__PURE__ */ new S,t=/* @__PURE__ */ new P,n=/* @__PURE__ */ new P;return function(r,i,a,o){xa(r,i,e);let s=e.x,c=e.y;if(s>=0&&s<=1&&c>=0&&c<=1)r.at(s,a),i.at(c,o);else if(s>=0&&s<=1)c<0?i.at(0,o):i.at(1,o),r.closestPointToPoint(o,!0,a);else if(c>=0&&c<=1)s<0?r.at(0,a):r.at(1,a),i.closestPointToPoint(a,!0,o);else{let e;e=s<0?r.start:r.end;let l;l=c<0?i.start:i.end;let u=t,d=n;if(r.closestPointToPoint(l,!0,t),i.closestPointToPoint(e,!0,n),u.distanceToSquared(l)<=d.distanceToSquared(e)){a.copy(u),o.copy(l);return}a.copy(e),o.copy(d);return}}})(),Ca=(function(){let e=/* @__PURE__ */ new P,t=/* @__PURE__ */ new P,n=/* @__PURE__ */ new qt,r=/* @__PURE__ */ new yn;return function(i,a){let{radius:o,center:s}=i,{a:c,b:l,c:u}=a;if(r.start=c,r.end=l,r.closestPointToPoint(s,!0,e).distanceTo(s)<=o||(r.start=c,r.end=u,r.closestPointToPoint(s,!0,e).distanceTo(s)<=o)||(r.start=l,r.end=u,r.closestPointToPoint(s,!0,e).distanceTo(s)<=o))return!0;let d=a.getPlane(n);if(Math.abs(d.distanceToPoint(s))<=o){let e=d.projectPoint(s,t);if(a.containsPoint(e))return!0}return!1}})(),wa=[`x`,`y`,`z`],Ta=1e-15,Ea=Ta*Ta;function Da(e){return Math.abs(e)<Ta}var Oa=class extends wt{constructor(...e){super(...e),this.isExtendedTriangle=!0,this.satAxes=[,,,,].fill().map(()=>new P),this.satBounds=[,,,,].fill().map(()=>new ba),this.points=[this.a,this.b,this.c],this.plane=new qt,this.isDegenerateIntoSegment=!1,this.isDegenerateIntoPoint=!1,this.degenerateSegment=new yn,this.needsUpdate=!0}intersectsSphere(e){return Ca(e,this)}update(){let e=this.a,t=this.b,n=this.c,r=this.points,i=this.satAxes,a=this.satBounds,o=i[0],s=a[0];this.getNormal(o),s.setFromPoints(o,r);let c=i[1],l=a[1];c.subVectors(e,t),l.setFromPoints(c,r);let u=i[2],d=a[2];u.subVectors(t,n),d.setFromPoints(u,r);let f=i[3],p=a[3];f.subVectors(n,e),p.setFromPoints(f,r);let m=c.length(),h=u.length(),g=f.length();this.isDegenerateIntoPoint=!1,this.isDegenerateIntoSegment=!1,m<Ta?h<Ta||g<Ta?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(e),this.degenerateSegment.end.copy(n)):h<Ta?g<Ta?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(t),this.degenerateSegment.end.copy(e)):g<Ta&&(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(n),this.degenerateSegment.end.copy(t)),this.plane.setFromNormalAndCoplanarPoint(o,e),this.needsUpdate=!1}};Oa.prototype.closestPointToSegment=(function(){let e=/* @__PURE__ */ new P,t=/* @__PURE__ */ new P,n=/* @__PURE__ */ new yn;return function(r,i=null,a=null){let{start:o,end:s}=r,c=this.points,l,u=1/0;for(let o=0;o<3;o++){let s=(o+1)%3;n.start.copy(c[o]),n.end.copy(c[s]),Sa(n,r,e,t),l=e.distanceToSquared(t),l<u&&(u=l,i&&i.copy(e),a&&a.copy(t))}return this.closestPointToPoint(o,e),l=o.distanceToSquared(e),l<u&&(u=l,i&&i.copy(e),a&&a.copy(o)),this.closestPointToPoint(s,e),l=s.distanceToSquared(e),l<u&&(u=l,i&&i.copy(e),a&&a.copy(s)),Math.sqrt(u)}})(),Oa.prototype.intersectsTriangle=(function(){let e=/* @__PURE__ */ new Oa,t=/* @__PURE__ */ new ba,n=/* @__PURE__ */ new ba,r=/* @__PURE__ */ new P,i=/* @__PURE__ */ new P,a=/* @__PURE__ */ new P,o=/* @__PURE__ */ new P,s=/* @__PURE__ */ new yn,c=/* @__PURE__ */ new yn,l=/* @__PURE__ */ new P,u=/* @__PURE__ */ new S,d=/* @__PURE__ */ new S;function f(e,i,a,s){let c=r;!e.isDegenerateIntoPoint&&!e.isDegenerateIntoSegment?c.copy(e.plane.normal):c.copy(i.plane.normal);let l=e.satBounds,u=e.satAxes;for(let r=1;r<4;r++){let a=l[r],s=u[r];if(t.setFromPoints(s,i.points),a.isSeparated(t)||(o.copy(c).cross(s),t.setFromPoints(o,e.points),n.setFromPoints(o,i.points),t.isSeparated(n)))return!1}let d=i.satBounds,f=i.satAxes;for(let r=1;r<4;r++){let a=d[r],s=f[r];if(t.setFromPoints(s,e.points),a.isSeparated(t)||(o.crossVectors(c,s),t.setFromPoints(o,e.points),n.setFromPoints(o,i.points),t.isSeparated(n)))return!1}return a&&(s||console.warn(`ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0.`),a.start.set(0,0,0),a.end.set(0,0,0)),!0}function p(e,t,n,r,i,a,o,s,c,l,u){let d=o/(o-s);l.x=r+(i-r)*d,u.start.subVectors(t,e).multiplyScalar(d).add(e),d=o/(o-c),l.y=r+(a-r)*d,u.end.subVectors(n,e).multiplyScalar(d).add(e)}function m(e,t,n,r,i,a,o,s,c,l,u){if(i>0)p(e.c,e.a,e.b,r,t,n,c,o,s,l,u);else if(a>0)p(e.b,e.a,e.c,n,t,r,s,o,c,l,u);else if(s*c>0||o!=0)p(e.a,e.b,e.c,t,n,r,o,s,c,l,u);else if(s!=0)p(e.b,e.a,e.c,n,t,r,s,o,c,l,u);else if(c!=0)p(e.c,e.a,e.b,r,t,n,c,o,s,l,u);else return!0;return!1}function h(e,t,n,i){let a=t.degenerateSegment,o=e.plane.distanceToPoint(a.start),s=e.plane.distanceToPoint(a.end);return Da(o)?Da(s)?f(e,t,n,i):(n&&(n.start.copy(a.start),n.end.copy(a.start)),e.containsPoint(a.start)):Da(s)?(n&&(n.start.copy(a.end),n.end.copy(a.end)),e.containsPoint(a.end)):e.plane.intersectLine(a,r)!=null&&(n&&(n.start.copy(r),n.end.copy(r)),e.containsPoint(r))}function g(e,t,n){let r=t.a;return Da(e.plane.distanceToPoint(r))&&e.containsPoint(r)?(n&&(n.start.copy(r),n.end.copy(r)),!0):!1}function _(e,t,n){let i=e.degenerateSegment,a=t.a;return i.closestPointToPoint(a,!0,r),a.distanceToSquared(r)<Ea&&(n&&(n.start.copy(a),n.end.copy(a)),!0)}function v(e,t,n,o){if(e.isDegenerateIntoSegment){if(t.isDegenerateIntoSegment){let o=e.degenerateSegment,s=t.degenerateSegment,c=i,l=a;o.delta(c),s.delta(l);let u=r.subVectors(s.start,o.start),d=c.x*l.y-c.y*l.x;if(Da(d))return!1;let f=(u.x*l.y-u.y*l.x)/d,p=-(c.x*u.y-c.y*u.x)/d;return f<0||f>1||p<0||p>1?!1:Da(o.start.z+c.z*f-(s.start.z+l.z*p))?(n&&(n.start.copy(o.start).addScaledVector(c,f),n.end.copy(o.start).addScaledVector(c,f)),!0):!1}return t.isDegenerateIntoPoint?_(e,t,n):h(t,e,n,o)}if(e.isDegenerateIntoPoint)return t.isDegenerateIntoPoint?t.a.distanceToSquared(e.a)<Ea&&(n&&(n.start.copy(e.a),n.end.copy(e.a)),!0):t.isDegenerateIntoSegment?_(t,e,n):g(t,e,n);if(t.isDegenerateIntoPoint)return g(e,t,n);if(t.isDegenerateIntoSegment)return h(e,t,n,o)}return function(t,n=null,r=!1){this.needsUpdate&&this.update(),t.isExtendedTriangle?t.needsUpdate&&t.update():(e.copy(t),e.update(),t=e);let o=v(this,t,n,r);if(o!==void 0)return o;let p=this.plane,h=t.plane,g=h.distanceToPoint(this.a),_=h.distanceToPoint(this.b),y=h.distanceToPoint(this.c);Da(g)&&(g=0),Da(_)&&(_=0),Da(y)&&(y=0);let b=g*_,x=g*y;if(b>0&&x>0)return!1;let S=p.distanceToPoint(t.a),C=p.distanceToPoint(t.b),w=p.distanceToPoint(t.c);Da(S)&&(S=0),Da(C)&&(C=0),Da(w)&&(w=0);let T=S*C,E=S*w;if(T>0&&E>0)return!1;i.copy(p.normal),a.copy(h.normal);let D=i.cross(a),O=0,k=Math.abs(D.x),ee=Math.abs(D.y);ee>k&&(k=ee,O=1),Math.abs(D.z)>k&&(O=2);let A=wa[O],te=this.a[A],j=this.b[A],ne=this.c[A],M=t.a[A],re=t.b[A],ie=t.c[A];if(m(this,te,j,ne,b,x,g,_,y,u,s)||m(t,M,re,ie,T,E,S,C,w,d,c))return f(this,t,n,r);if(u.y<u.x){let e=u.y;u.y=u.x,u.x=e,l.copy(s.start),s.start.copy(s.end),s.end.copy(l)}if(d.y<d.x){let e=d.y;d.y=d.x,d.x=e,l.copy(c.start),c.start.copy(c.end),c.end.copy(l)}return u.y<d.x||d.y<u.x?!1:(n&&(d.x>u.x?n.start.copy(c.start):n.start.copy(s.start),d.y<u.y?n.end.copy(c.end):n.end.copy(s.end)),!0)}})(),Oa.prototype.distanceToPoint=(function(){let e=/* @__PURE__ */ new P;return function(t){return this.closestPointToPoint(t,e),t.distanceTo(e)}})(),Oa.prototype.distanceToTriangle=(function(){let e=/* @__PURE__ */ new P,t=/* @__PURE__ */ new P,n=[`a`,`b`,`c`],r=/* @__PURE__ */ new yn,i=/* @__PURE__ */ new yn;return function(a,o=null,s=null){let c=o||s?r:null;if(this.intersectsTriangle(a,c,!0))return(o||s)&&(o&&c.getCenter(o),s&&c.getCenter(s)),0;let l=1/0;for(let t=0;t<3;t++){let r,i=n[t],c=a[i];this.closestPointToPoint(c,e),r=c.distanceToSquared(e),r<l&&(l=r,o&&o.copy(e),s&&s.copy(c));let u=this[i];a.closestPointToPoint(u,e),r=u.distanceToSquared(e),r<l&&(l=r,o&&o.copy(u),s&&s.copy(e))}for(let c=0;c<3;c++){let u=n[c],d=n[(c+1)%3];r.set(this[u],this[d]);for(let c=0;c<3;c++){let u=n[c],d=n[(c+1)%3];i.set(a[u],a[d]),Sa(r,i,e,t);let f=e.distanceToSquared(t);f<l&&(l=f,o&&o.copy(e),s&&s.copy(t))}}return Math.sqrt(l)}})();var ka=class{constructor(e,t,n){this.isOrientedBox=!0,this.min=new P,this.max=new P,this.matrix=new Le,this.invMatrix=new Le,this.points=Array(8).fill().map(()=>new P),this.satAxes=[,,,].fill().map(()=>new P),this.satBounds=[,,,].fill().map(()=>new ba),this.alignedSatBounds=[,,,].fill().map(()=>new ba),this.needsUpdate=!1,e&&this.min.copy(e),t&&this.max.copy(t),n&&this.matrix.copy(n)}set(e,t,n){this.min.copy(e),this.max.copy(t),this.matrix.copy(n),this.needsUpdate=!0}copy(e){this.min.copy(e.min),this.max.copy(e.max),this.matrix.copy(e.matrix),this.needsUpdate=!0}};ka.prototype.update=(function(){return function(){let e=this.matrix,t=this.min,n=this.max,r=this.points;for(let i=0;i<=1;i++)for(let a=0;a<=1;a++)for(let o=0;o<=1;o++){let s=r[1*i|2*a|4*o];s.x=i?n.x:t.x,s.y=a?n.y:t.y,s.z=o?n.z:t.z,s.applyMatrix4(e)}let i=this.satBounds,a=this.satAxes,o=r[0];for(let e=0;e<3;e++){let t=a[e],n=i[e],s=r[1<<e];t.subVectors(o,s),n.setFromPoints(t,r)}let s=this.alignedSatBounds;s[0].setFromPointsField(r,`x`),s[1].setFromPointsField(r,`y`),s[2].setFromPointsField(r,`z`),this.invMatrix.copy(this.matrix).invert(),this.needsUpdate=!1}})(),ka.prototype.intersectsBox=(function(){let e=/* @__PURE__ */ new ba;return function(t){this.needsUpdate&&this.update();let n=t.min,r=t.max,i=this.satBounds,a=this.satAxes,o=this.alignedSatBounds;if(e.min=n.x,e.max=r.x,o[0].isSeparated(e)||(e.min=n.y,e.max=r.y,o[1].isSeparated(e))||(e.min=n.z,e.max=r.z,o[2].isSeparated(e)))return!1;for(let n=0;n<3;n++){let r=a[n],o=i[n];if(e.setFromBox(r,t),o.isSeparated(e))return!1}return!0}})(),ka.prototype.intersectsTriangle=(function(){let e=/* @__PURE__ */ new Oa,t=[,,,],n=/* @__PURE__ */ new ba,r=/* @__PURE__ */ new ba,i=/* @__PURE__ */ new P;return function(a){this.needsUpdate&&this.update(),a.isExtendedTriangle?a.needsUpdate&&a.update():(e.copy(a),e.update(),a=e);let o=this.satBounds,s=this.satAxes;t[0]=a.a,t[1]=a.b,t[2]=a.c;for(let e=0;e<3;e++){let r=o[e],i=s[e];if(n.setFromPoints(i,t),r.isSeparated(n))return!1}let c=a.satBounds,l=a.satAxes,u=this.points;for(let e=0;e<3;e++){let t=c[e],r=l[e];if(n.setFromPoints(r,u),t.isSeparated(n))return!1}for(let e=0;e<3;e++){let a=s[e];for(let e=0;e<4;e++){let o=l[e];if(i.crossVectors(a,o),n.setFromPoints(i,t),r.setFromPoints(i,u),n.isSeparated(r))return!1}}return!0}})(),ka.prototype.closestPointToPoint=(function(){return function(e,t){return this.needsUpdate&&this.update(),t.copy(e).applyMatrix4(this.invMatrix).clamp(this.min,this.max).applyMatrix4(this.matrix),t}})(),ka.prototype.distanceToPoint=(function(){let e=new P;return function(t){return this.closestPointToPoint(t,e),t.distanceTo(e)}})(),ka.prototype.distanceToBox=(function(){let e=[`x`,`y`,`z`],t=/* @__PURE__ */ Array(12).fill().map(()=>new yn),n=/* @__PURE__ */ Array(12).fill().map(()=>new yn),r=/* @__PURE__ */ new P,i=/* @__PURE__ */ new P;return function(a,o=0,s=null,c=null){if(this.needsUpdate&&this.update(),this.intersectsBox(a))return(s||c)&&(a.getCenter(i),this.closestPointToPoint(i,r),a.closestPointToPoint(r,i),s&&s.copy(r),c&&c.copy(i)),0;let l=o*o,u=a.min,d=a.max,f=this.points,p=1/0;for(let e=0;e<8;e++){let t=f[e];i.copy(t).clamp(u,d);let n=t.distanceToSquared(i);if(n<p&&(p=n,s&&s.copy(t),c&&c.copy(i),n<l))return Math.sqrt(n)}let m=0;for(let r=0;r<3;r++)for(let i=0;i<=1;i++)for(let a=0;a<=1;a++){let o=(r+1)%3,s=(r+2)%3,c=i<<o|a<<s,l=1<<r|i<<o|a<<s,p=f[c],h=f[l];t[m].set(p,h);let g=e[r],_=e[o],v=e[s],y=n[m],b=y.start,x=y.end;b[g]=u[g],b[_]=i?u[_]:d[_],b[v]=a?u[v]:d[_],x[g]=d[g],x[_]=i?u[_]:d[_],x[v]=a?u[v]:d[_],m++}for(let e=0;e<=1;e++)for(let t=0;t<=1;t++)for(let n=0;n<=1;n++){i.x=e?d.x:u.x,i.y=t?d.y:u.y,i.z=n?d.z:u.z,this.closestPointToPoint(i,r);let a=i.distanceToSquared(r);if(a<p&&(p=a,s&&s.copy(r),c&&c.copy(i),a<l))return Math.sqrt(a)}for(let e=0;e<12;e++){let a=t[e];for(let e=0;e<12;e++){let t=n[e];Sa(a,t,r,i);let o=r.distanceToSquared(i);if(o<p&&(p=o,s&&s.copy(r),c&&c.copy(i),o<l))return Math.sqrt(o)}}return Math.sqrt(p)}})();let Aa=/* @__PURE__ */ new class extends Ui{constructor(){super(()=>new Oa)}},ja=/* @__PURE__ */ new P,Ma=/* @__PURE__ */ new P;function Na(e,t,n={},r=0,i=1/0){let a=r*r,o=i*i,s=1/0,c=null;if(e.shapecast({boundsTraverseOrder:e=>(ja.copy(t).clamp(e.min,e.max),ja.distanceToSquared(t)),intersectsBounds:(e,t,n)=>n<s&&n<o,intersectsTriangle:(e,n)=>{e.closestPointToPoint(t,ja);let r=t.distanceToSquared(ja);return r<s&&(Ma.copy(ja),s=r,c=n),r<a}}),s===1/0)return null;let l=Math.sqrt(s);return n.point?n.point.copy(Ma):n.point=Ma.clone(),n.distance=l,n.faceIndex=c,n}let Pa=/* @__PURE__ */ new P,Fa=/* @__PURE__ */ new P,Ia=/* @__PURE__ */ new P,La=/* @__PURE__ */ new S,Ra=/* @__PURE__ */ new S,za=/* @__PURE__ */ new S,Ba=/* @__PURE__ */ new P,Va=/* @__PURE__ */ new P,Ha=/* @__PURE__ */ new P,Ua=/* @__PURE__ */ new P;function Wa(e,t,n,r,i,a,o,s){let c;if(c=a===1?e.intersectTriangle(r,n,t,!0,i):e.intersectTriangle(t,n,r,a!==2,i),c===null)return null;let l=e.origin.distanceTo(i);return l<o||l>s?null:{distance:l,point:i.clone()}}function Ga(e,t,n,r,i,a,o,s,c,l,u){Pa.fromBufferAttribute(t,a),Fa.fromBufferAttribute(t,o),Ia.fromBufferAttribute(t,s);let d=Wa(e,Pa,Fa,Ia,Ua,c,l,u);if(d){r&&(La.fromBufferAttribute(r,a),Ra.fromBufferAttribute(r,o),za.fromBufferAttribute(r,s),d.uv=new S,wt.getInterpolation(Ua,Pa,Fa,Ia,La,Ra,za,d.uv)),i&&(La.fromBufferAttribute(i,a),Ra.fromBufferAttribute(i,o),za.fromBufferAttribute(i,s),d.uv1=new S,wt.getInterpolation(Ua,Pa,Fa,Ia,La,Ra,za,d.uv1)),n&&(Ba.fromBufferAttribute(n,a),Va.fromBufferAttribute(n,o),Ha.fromBufferAttribute(n,s),d.normal=new P,wt.getInterpolation(Ua,Pa,Fa,Ia,Ba,Va,Ha,d.normal),d.normal.dot(e.direction)>0&&d.normal.multiplyScalar(-1));let t={a,b:o,c:s,normal:new P,materialIndex:0};wt.getNormal(Pa,Fa,Ia,t.normal),d.face=t,d.faceIndex=a;{let e=new P;wt.getBarycoord(Ua,Pa,Fa,Ia,e),d.barycoord=e}}return d}function Ka(e){return e&&e.isMaterial?e.side:e}function qa(e,t,n,r,i,a,o){let s=r*3,c=s+0,l=s+1,u=s+2,{index:d,groups:f}=e;e.index&&(c=d.getX(c),l=d.getX(l),u=d.getX(u));let{position:p,normal:m,uv:h,uv1:g}=e.attributes;if(Array.isArray(t)){let e=r*3;for(let s=0,d=f.length;s<d;s++){let{start:d,count:_,materialIndex:v}=f[s];if(e>=d&&e<d+_){let e=Ka(t[v]),s=Ga(n,p,m,h,g,c,l,u,e,a,o);if(s){if(s.faceIndex=r,s.face.materialIndex=v,i)i.push(s);else return s}}}}else{let e=Ka(t),s=Ga(n,p,m,h,g,c,l,u,e,a,o);if(s){if(s.faceIndex=r,s.face.materialIndex=0,i)i.push(s);else return s}}return null}function Q(e,t,n,r){let i=e.a,a=e.b,o=e.c,s=t,c=t+1,l=t+2;n&&(s=n.getX(s),c=n.getX(c),l=n.getX(l)),i.x=r.getX(s),i.y=r.getY(s),i.z=r.getZ(s),a.x=r.getX(c),a.y=r.getY(c),a.z=r.getZ(c),o.x=r.getX(l),o.y=r.getY(l),o.z=r.getZ(l)}function Ja(e,t,n,r,i,a,o,s){let{geometry:c,_indirectBuffer:l}=e;for(let e=r,l=r+i;e<l;e++)qa(c,t,n,e,a,o,s)}function Ya(e,t,n,r,i,a,o){let{geometry:s,_indirectBuffer:c}=e,l=1/0,u=null;for(let e=r,c=r+i;e<c;e++){let r;r=qa(s,t,n,e,null,a,o),r&&r.distance<l&&(u=r,l=r.distance)}return u}function Xa(e,t,n,r,i,a,o){let{geometry:s}=n,{index:c}=s,l=s.attributes.position;for(let n=e,s=t+e;n<s;n++){let e;if(e=n,Q(o,e*3,c,l),o.needsUpdate=!0,r(o,e,i,a))return!0}return!1}function Za(e,t=null){t&&Array.isArray(t)&&(t=new Set(t));let n=e.geometry,r=n.index?n.index.array:null,i=n.attributes.position,a,o,s,c,l=0,u=e._roots;for(let e=0,t=u.length;e<t;e++)a=u[e],o=new Uint32Array(a),s=new Uint16Array(a),c=new Float32Array(a),d(0,l),l+=a.byteLength;function d(e,n,a=!1){let l=e*2;if(q(l,s)){let t=Si(e,o),n=Ci(l,s),a=1/0,u=1/0,d=1/0,f=-1/0,p=-1/0,m=-1/0;for(let e=3*t,o=3*(t+n);e<o;e++){let t=r[e],n=i.getX(t),o=i.getY(t),s=i.getZ(t);n<a&&(a=n),n>f&&(f=n),o<u&&(u=o),o>p&&(p=o),s<d&&(d=s),s>m&&(m=s)}return c[e+0]!==a||c[e+1]!==u||c[e+2]!==d||c[e+3]!==f||c[e+4]!==p||c[e+5]!==m?(c[e+0]=a,c[e+1]=u,c[e+2]=d,c[e+3]=f,c[e+4]=p,c[e+5]=m,!0):!1}{let r=J(e),i=Y(e,o),s=a,l=!1,u=!1;if(t){if(!s){let e=r/8+n/32,a=i/8+n/32;l=t.has(e),u=t.has(a),s=!l&&!u}}else l=!0,u=!0;let f=s||l,p=s||u,m=!1;f&&(m=d(r,n,s));let h=!1;p&&(h=d(i,n,s));let g=m||h;if(g)for(let t=0;t<3;t++){let n=r+t,a=i+t,o=c[n],s=c[n+3],l=c[a],u=c[a+3];c[e+t]=o<l?o:l,c[e+t+3]=s>u?s:u}return g}}}function Qa(e,t,n,r,i){let a,o,s,c,l,u,d=1/n.direction.x,f=1/n.direction.y,p=1/n.direction.z,m=n.origin.x,h=n.origin.y,g=n.origin.z,_=t[e],v=t[e+3],y=t[e+1],b=t[e+3+1],x=t[e+2],S=t[e+3+2];return d>=0?(a=(_-m)*d,o=(v-m)*d):(a=(v-m)*d,o=(_-m)*d),f>=0?(s=(y-h)*f,c=(b-h)*f):(s=(b-h)*f,c=(y-h)*f),a>c||s>o||((s>a||isNaN(a))&&(a=s),(c<o||isNaN(o))&&(o=c),p>=0?(l=(x-g)*p,u=(S-g)*p):(l=(S-g)*p,u=(x-g)*p),a>u||l>o)?!1:((l>a||a!==a)&&(a=l),(u<o||o!==o)&&(o=u),a<=i&&o>=r)}function $a(e,t,n,r,i,a,o,s){let{geometry:c,_indirectBuffer:l}=e;for(let e=r,u=r+i;e<u;e++)qa(c,t,n,l?l[e]:e,a,o,s)}function eo(e,t,n,r,i,a,o){let{geometry:s,_indirectBuffer:c}=e,l=1/0,u=null;for(let e=r,d=r+i;e<d;e++){let r;r=qa(s,t,n,c?c[e]:e,null,a,o),r&&r.distance<l&&(u=r,l=r.distance)}return u}function to(e,t,n,r,i,a,o){let{geometry:s}=n,{index:c}=s,l=s.attributes.position;for(let s=e,u=t+e;s<u;s++){let e;if(e=n.resolveTriangleIndex(s),Q(o,e*3,c,l),o.needsUpdate=!0,r(o,e,i,a))return!0}return!1}function no(e,t,n,r,i,a,o){Z.setBuffer(e._roots[t]),ro(0,e,n,r,i,a,o),Z.clearBuffer()}function ro(e,t,n,r,i,a,o){let{float32Array:s,uint16Array:c,uint32Array:l}=Z,u=e*2;if(q(u,c))Ja(t,n,r,Si(e,l),Ci(u,c),i,a,o);else{let c=J(e);Qa(c,s,r,a,o)&&ro(c,t,n,r,i,a,o);let u=Y(e,l);Qa(u,s,r,a,o)&&ro(u,t,n,r,i,a,o)}}let io=[`x`,`y`,`z`];function ao(e,t,n,r,i,a){Z.setBuffer(e._roots[t]);let o=oo(0,e,n,r,i,a);return Z.clearBuffer(),o}function oo(e,t,n,r,i,a){let{float32Array:o,uint16Array:s,uint32Array:c}=Z,l=e*2;if(q(l,s))return Ya(t,n,r,Si(e,c),Ci(l,s),i,a);{let s=wi(e,c),l=io[s],u=r.direction[l]>=0,d,f;u?(d=J(e),f=Y(e,c)):(d=Y(e,c),f=J(e));let p=Qa(d,o,r,i,a)?oo(d,t,n,r,i,a):null;if(p){let e=p.point[l];if(u?e<=o[f+s]:e>=o[f+s+3])return p}let m=Qa(f,o,r,i,a)?oo(f,t,n,r,i,a):null;return p&&m?p.distance<=m.distance?p:m:p||m||null}}let so=/* @__PURE__ */ new F,co=/* @__PURE__ */ new Oa,lo=/* @__PURE__ */ new Oa,uo=/* @__PURE__ */ new Le,fo=/* @__PURE__ */ new ka,po=/* @__PURE__ */ new ka;function mo(e,t,n,r){Z.setBuffer(e._roots[t]);let i=ho(0,e,n,r);return Z.clearBuffer(),i}function ho(e,t,n,r,i=null){let{float32Array:a,uint16Array:o,uint32Array:s}=Z,c=e*2;if(i===null&&(n.boundingBox||n.computeBoundingBox(),fo.set(n.boundingBox.min,n.boundingBox.max,r),i=fo),q(c,o)){let i=t.geometry,l=i.index,u=i.attributes.position,d=n.index,f=n.attributes.position,p=Si(e,s),m=Ci(c,o);if(uo.copy(r).invert(),n.boundsTree)return K(X(e),a,po),po.matrix.copy(uo),po.needsUpdate=!0,n.boundsTree.shapecast({intersectsBounds:e=>po.intersectsBox(e),intersectsTriangle:e=>{e.a.applyMatrix4(r),e.b.applyMatrix4(r),e.c.applyMatrix4(r),e.needsUpdate=!0;for(let t=p*3,n=(m+p)*3;t<n;t+=3)if(Q(lo,t,l,u),lo.needsUpdate=!0,e.intersectsTriangle(lo))return!0;return!1}});{let e=fa(n);for(let t=p*3,n=(m+p)*3;t<n;t+=3){Q(co,t,l,u),co.a.applyMatrix4(uo),co.b.applyMatrix4(uo),co.c.applyMatrix4(uo),co.needsUpdate=!0;for(let t=0,n=e*3;t<n;t+=3)if(Q(lo,t,d,f),lo.needsUpdate=!0,co.intersectsTriangle(lo))return!0}}}else{let o=J(e),c=Y(e,s);return K(X(o),a,so),!!(i.intersectsBox(so)&&ho(o,t,n,r,i)||(K(X(c),a,so),i.intersectsBox(so)&&ho(c,t,n,r,i)))}}let go=/* @__PURE__ */ new Le,_o=/* @__PURE__ */ new ka,vo=/* @__PURE__ */ new ka,yo=/* @__PURE__ */ new P,bo=/* @__PURE__ */ new P,xo=/* @__PURE__ */ new P,So=/* @__PURE__ */ new P;function Co(e,t,n,r={},i={},a=0,o=1/0){t.boundingBox||t.computeBoundingBox(),_o.set(t.boundingBox.min,t.boundingBox.max,n),_o.needsUpdate=!0;let s=e.geometry,c=s.attributes.position,l=s.index,u=t.attributes.position,d=t.index,f=Aa.getPrimitive(),p=Aa.getPrimitive(),m=yo,h=bo,g=null,_=null;i&&(g=xo,_=So);let v=1/0,y=null,b=null;return go.copy(n).invert(),vo.matrix.copy(go),e.shapecast({boundsTraverseOrder:e=>_o.distanceToBox(e),intersectsBounds:(e,t,n)=>n<v&&n<o&&(t&&(vo.min.copy(e.min),vo.max.copy(e.max),vo.needsUpdate=!0),!0),intersectsRange:(e,r)=>{if(t.boundsTree)return t.boundsTree.shapecast({boundsTraverseOrder:e=>vo.distanceToBox(e),intersectsBounds:(e,t,n)=>n<v&&n<o,intersectsRange:(t,i)=>{for(let o=t,s=t+i;o<s;o++){Q(p,3*o,d,u),p.a.applyMatrix4(n),p.b.applyMatrix4(n),p.c.applyMatrix4(n),p.needsUpdate=!0;for(let t=e,n=e+r;t<n;t++){Q(f,3*t,l,c),f.needsUpdate=!0;let e=f.distanceToTriangle(p,m,g);if(e<v&&(h.copy(m),_&&_.copy(g),v=e,y=t,b=o),e<a)return!0}}}});{let i=fa(t);for(let t=0,o=i;t<o;t++){Q(p,3*t,d,u),p.a.applyMatrix4(n),p.b.applyMatrix4(n),p.c.applyMatrix4(n),p.needsUpdate=!0;for(let n=e,i=e+r;n<i;n++){Q(f,3*n,l,c),f.needsUpdate=!0;let e=f.distanceToTriangle(p,m,g);if(e<v&&(h.copy(m),_&&_.copy(g),v=e,y=n,b=t),e<a)return!0}}}}}),Aa.releasePrimitive(f),Aa.releasePrimitive(p),v===1/0?null:(r.point?r.point.copy(h):r.point=h.clone(),r.distance=v,r.faceIndex=y,i&&(i.point?i.point.copy(_):i.point=_.clone(),i.point.applyMatrix4(go),h.applyMatrix4(go),i.distance=h.sub(i.point).length(),i.faceIndex=b),r)}function wo(e,t=null){t&&Array.isArray(t)&&(t=new Set(t));let n=e.geometry,r=n.index?n.index.array:null,i=n.attributes.position,a,o,s,c,l=0,u=e._roots;for(let e=0,t=u.length;e<t;e++)a=u[e],o=new Uint32Array(a),s=new Uint16Array(a),c=new Float32Array(a),d(0,l),l+=a.byteLength;function d(n,a,l=!1){let u=n*2;if(q(u,s)){let t=Si(n,o),a=Ci(u,s),l=1/0,d=1/0,f=1/0,p=-1/0,m=-1/0,h=-1/0;for(let n=t,o=t+a;n<o;n++){let t=3*e.resolveTriangleIndex(n);for(let e=0;e<3;e++){let n=t+e;n=r?r[n]:n;let a=i.getX(n),o=i.getY(n),s=i.getZ(n);a<l&&(l=a),a>p&&(p=a),o<d&&(d=o),o>m&&(m=o),s<f&&(f=s),s>h&&(h=s)}}return c[n+0]!==l||c[n+1]!==d||c[n+2]!==f||c[n+3]!==p||c[n+4]!==m||c[n+5]!==h?(c[n+0]=l,c[n+1]=d,c[n+2]=f,c[n+3]=p,c[n+4]=m,c[n+5]=h,!0):!1}{let e=J(n),r=Y(n,o),i=l,s=!1,u=!1;if(t){if(!i){let n=e/8+a/32,o=r/8+a/32;s=t.has(n),u=t.has(o),i=!s&&!u}}else s=!0,u=!0;let f=i||s,p=i||u,m=!1;f&&(m=d(e,a,i));let h=!1;p&&(h=d(r,a,i));let g=m||h;if(g)for(let t=0;t<3;t++){let i=e+t,a=r+t,o=c[i],s=c[i+3],l=c[a],u=c[a+3];c[n+t]=o<l?o:l,c[n+t+3]=s>u?s:u}return g}}}function To(e,t,n,r,i,a,o){Z.setBuffer(e._roots[t]),Eo(0,e,n,r,i,a,o),Z.clearBuffer()}function Eo(e,t,n,r,i,a,o){let{float32Array:s,uint16Array:c,uint32Array:l}=Z,u=e*2;if(q(u,c))$a(t,n,r,Si(e,l),Ci(u,c),i,a,o);else{let c=J(e);Qa(c,s,r,a,o)&&Eo(c,t,n,r,i,a,o);let u=Y(e,l);Qa(u,s,r,a,o)&&Eo(u,t,n,r,i,a,o)}}let Do=[`x`,`y`,`z`];function Oo(e,t,n,r,i,a){Z.setBuffer(e._roots[t]);let o=ko(0,e,n,r,i,a);return Z.clearBuffer(),o}function ko(e,t,n,r,i,a){let{float32Array:o,uint16Array:s,uint32Array:c}=Z,l=e*2;if(q(l,s))return eo(t,n,r,Si(e,c),Ci(l,s),i,a);{let s=wi(e,c),l=Do[s],u=r.direction[l]>=0,d,f;u?(d=J(e),f=Y(e,c)):(d=Y(e,c),f=J(e));let p=Qa(d,o,r,i,a)?ko(d,t,n,r,i,a):null;if(p){let e=p.point[l];if(u?e<=o[f+s]:e>=o[f+s+3])return p}let m=Qa(f,o,r,i,a)?ko(f,t,n,r,i,a):null;return p&&m?p.distance<=m.distance?p:m:p||m||null}}let Ao=/* @__PURE__ */ new F,jo=/* @__PURE__ */ new Oa,Mo=/* @__PURE__ */ new Oa,No=/* @__PURE__ */ new Le,Po=/* @__PURE__ */ new ka,Fo=/* @__PURE__ */ new ka;function Io(e,t,n,r){Z.setBuffer(e._roots[t]);let i=Lo(0,e,n,r);return Z.clearBuffer(),i}function Lo(e,t,n,r,i=null){let{float32Array:a,uint16Array:o,uint32Array:s}=Z,c=e*2;if(i===null&&(n.boundingBox||n.computeBoundingBox(),Po.set(n.boundingBox.min,n.boundingBox.max,r),i=Po),q(c,o)){let i=t.geometry,l=i.index,u=i.attributes.position,d=n.index,f=n.attributes.position,p=Si(e,s),m=Ci(c,o);if(No.copy(r).invert(),n.boundsTree)return K(X(e),a,Fo),Fo.matrix.copy(No),Fo.needsUpdate=!0,n.boundsTree.shapecast({intersectsBounds:e=>Fo.intersectsBox(e),intersectsTriangle:e=>{e.a.applyMatrix4(r),e.b.applyMatrix4(r),e.c.applyMatrix4(r),e.needsUpdate=!0;for(let n=p,r=m+p;n<r;n++)if(Q(Mo,3*t.resolveTriangleIndex(n),l,u),Mo.needsUpdate=!0,e.intersectsTriangle(Mo))return!0;return!1}});{let e=fa(n);for(let n=p,r=m+p;n<r;n++){let r=t.resolveTriangleIndex(n);Q(jo,3*r,l,u),jo.a.applyMatrix4(No),jo.b.applyMatrix4(No),jo.c.applyMatrix4(No),jo.needsUpdate=!0;for(let t=0,n=e*3;t<n;t+=3)if(Q(Mo,t,d,f),Mo.needsUpdate=!0,jo.intersectsTriangle(Mo))return!0}}}else{let o=J(e),c=Y(e,s);return K(X(o),a,Ao),!!(i.intersectsBox(Ao)&&Lo(o,t,n,r,i)||(K(X(c),a,Ao),i.intersectsBox(Ao)&&Lo(c,t,n,r,i)))}}let Ro=/* @__PURE__ */ new Le,zo=/* @__PURE__ */ new ka,Bo=/* @__PURE__ */ new ka,Vo=/* @__PURE__ */ new P,Ho=/* @__PURE__ */ new P,Uo=/* @__PURE__ */ new P,Wo=/* @__PURE__ */ new P;function Go(e,t,n,r={},i={},a=0,o=1/0){t.boundingBox||t.computeBoundingBox(),zo.set(t.boundingBox.min,t.boundingBox.max,n),zo.needsUpdate=!0;let s=e.geometry,c=s.attributes.position,l=s.index,u=t.attributes.position,d=t.index,f=Aa.getPrimitive(),p=Aa.getPrimitive(),m=Vo,h=Ho,g=null,_=null;i&&(g=Uo,_=Wo);let v=1/0,y=null,b=null;return Ro.copy(n).invert(),Bo.matrix.copy(Ro),e.shapecast({boundsTraverseOrder:e=>zo.distanceToBox(e),intersectsBounds:(e,t,n)=>n<v&&n<o&&(t&&(Bo.min.copy(e.min),Bo.max.copy(e.max),Bo.needsUpdate=!0),!0),intersectsRange:(r,i)=>{if(t.boundsTree){let s=t.boundsTree;return s.shapecast({boundsTraverseOrder:e=>Bo.distanceToBox(e),intersectsBounds:(e,t,n)=>n<v&&n<o,intersectsRange:(t,o)=>{for(let x=t,S=t+o;x<S;x++){let t=s.resolveTriangleIndex(x);Q(p,3*t,d,u),p.a.applyMatrix4(n),p.b.applyMatrix4(n),p.c.applyMatrix4(n),p.needsUpdate=!0;for(let t=r,n=r+i;t<n;t++){let n=e.resolveTriangleIndex(t);Q(f,3*n,l,c),f.needsUpdate=!0;let r=f.distanceToTriangle(p,m,g);if(r<v&&(h.copy(m),_&&_.copy(g),v=r,y=t,b=x),r<a)return!0}}}})}{let o=fa(t);for(let t=0,s=o;t<s;t++){Q(p,3*t,d,u),p.a.applyMatrix4(n),p.b.applyMatrix4(n),p.c.applyMatrix4(n),p.needsUpdate=!0;for(let n=r,o=r+i;n<o;n++){let r=e.resolveTriangleIndex(n);Q(f,3*r,l,c),f.needsUpdate=!0;let i=f.distanceToTriangle(p,m,g);if(i<v&&(h.copy(m),_&&_.copy(g),v=i,y=n,b=t),i<a)return!0}}}}}),Aa.releasePrimitive(f),Aa.releasePrimitive(p),v===1/0?null:(r.point?r.point.copy(h):r.point=h.clone(),r.distance=v,r.faceIndex=y,i&&(i.point?i.point.copy(_):i.point=_.clone(),i.point.applyMatrix4(Ro),h.applyMatrix4(Ro),i.distance=h.sub(i.point).length(),i.faceIndex=b),r)}function Ko(e,t,n){return e===null?null:(e.point.applyMatrix4(t.matrixWorld),e.distance=e.point.distanceTo(n.ray.origin),e.object=t,e)}let qo=/* @__PURE__ */ new ka,Jo=/* @__PURE__ */ new Ie,Yo=/* @__PURE__ */ new P,Xo=/* @__PURE__ */ new Le,Zo=/* @__PURE__ */ new P,Qo=[`getX`,`getY`,`getZ`];var $o=class e extends ya{static serialize(e,t={}){t={cloneBuffers:!0,...t};let n=e.geometry,r=e._roots,i=e._indirectBuffer,a=n.getIndex(),o={version:1,roots:null,index:null,indirectBuffer:null};return t.cloneBuffers?(o.roots=r.map(e=>e.slice()),o.index=a?a.array.slice():null,o.indirectBuffer=i?i.slice():null):(o.roots=r,o.index=a?a.array:null,o.indirectBuffer=i),o}static deserialize(t,n,r={}){r={setIndex:!0,indirect:!!t.indirectBuffer,...r};let{index:i,roots:a,indirectBuffer:o}=t;t.version||(console.warn(`MeshBVH.deserialize: Serialization format has been changed and will be fixed up. It is recommended to regenerate any stored serialized data.`),c(a));let s=new e(n,{...r,[hi]:!0});if(s._roots=a,s._indirectBuffer=o||null,r.setIndex){let e=n.getIndex();if(e===null){let e=new At(t.index,1,!1);n.setIndex(e)}else e.array!==i&&(e.array.set(i),e.needsUpdate=!0)}return s;function c(e){for(let t=0;t<e.length;t++){let n=e[t],r=new Uint32Array(n),i=new Uint16Array(n);for(let e=0,t=n.byteLength/32;e<t;e++){let t=8*e;q(2*t,i)||(r[t+6]=r[t+6]/8-e)}}}}get primitiveStride(){return 3}get resolveTriangleIndex(){return this.resolvePrimitiveIndex}constructor(e,t={}){t.maxLeafTris&&(console.warn(`MeshBVH: "maxLeafTris" option has been deprecated. Use "targetLeafSize", instead.`),t={...t,targetLeafSize:t.maxLeafTris}),super(e,t)}shiftTriangleOffsets(e){return super.shiftPrimitiveOffsets(e)}writePrimitiveBounds(e,t,n){let r=this.geometry,i=this._indirectBuffer,a=r.attributes.position,o=r.index?r.index.array:null,s=(i?i[e]:e)*3,c=s+0,l=s+1,u=s+2;o&&(c=o[c],l=o[l],u=o[u]);for(let e=0;e<3;e++){let r=a[Qo[e]](c),i=a[Qo[e]](l),o=a[Qo[e]](u),s=r;i<s&&(s=i),o<s&&(s=o);let d=r;i>d&&(d=i),o>d&&(d=o),t[n+e]=s,t[n+e+3]=d}return t}computePrimitiveBounds(e,t,n){let r=this.geometry,i=this._indirectBuffer,a=r.attributes.position,o=r.index?r.index.array:null,s=a.normalized;if(e<0||t+e-n.offset>n.length/6)throw Error(`MeshBVH: compute triangle bounds range is invalid.`);let c=a.array,l=a.offset||0,u=3;a.isInterleavedBufferAttribute&&(u=a.data.stride);let d=[`getX`,`getY`,`getZ`],f=n.offset;for(let r=e,p=e+t;r<p;r++){let e=(i?i[r]:r)*3,t=(r-f)*6,p=e+0,m=e+1,h=e+2;o&&(p=o[p],m=o[m],h=o[h]),s||(p=p*u+l,m=m*u+l,h=h*u+l);for(let e=0;e<3;e++){let r,i,o;s?(r=a[d[e]](p),i=a[d[e]](m),o=a[d[e]](h)):(r=c[p+e],i=c[m+e],o=c[h+e]);let l=r;i<l&&(l=i),o<l&&(l=o);let u=r;i>u&&(u=i),o>u&&(u=o);let f=(u-l)/2,g=e*2;n[t+g+0]=l+f,n[t+g+1]=f+(Math.abs(l)+f)*mi}}return n}raycastObject3D(e,t,n=[]){let{material:r}=e;if(r===void 0)return;Xo.copy(e.matrixWorld).invert(),Jo.copy(t.ray).applyMatrix4(Xo),Zo.setFromMatrixScale(e.matrixWorld),Yo.copy(Jo.direction).multiply(Zo);let i=Yo.length(),a=t.near/i,o=t.far/i;if(t.firstHitOnly===!0){let i=this.raycastFirst(Jo,r,a,o);i=Ko(i,e,t),i&&n.push(i)}else{let i=this.raycast(Jo,r,a,o);for(let r=0,a=i.length;r<a;r++){let a=Ko(i[r],e,t);a&&n.push(a)}}return n}refit(e=null){return(this.indirect?wo:Za)(this,e)}raycast(e,t=0,n=0,r=1/0){let i=this._roots,a=[],o=this.indirect?To:no;for(let s=0,c=i.length;s<c;s++)o(this,s,t,e,a,n,r);return a}raycastFirst(e,t=0,n=0,r=1/0){let i=this._roots,a=null,o=this.indirect?Oo:ao;for(let s=0,c=i.length;s<c;s++){let i=o(this,s,t,e,n,r);i!=null&&(a==null||i.distance<a.distance)&&(a=i)}return a}intersectsGeometry(e,t){let n=!1,r=this._roots,i=this.indirect?Io:mo;for(let a=0,o=r.length;a<o&&(n=i(this,a,e,t),!n);a++);return n}shapecast(e){let t=Aa.getPrimitive(),n=super.shapecast({...e,intersectsPrimitive:e.intersectsTriangle,scratchPrimitive:t,iterate:this.indirect?to:Xa});return Aa.releasePrimitive(t),n}bvhcast(t,n,r){let{intersectsRanges:i,intersectsTriangles:a}=r,o=Aa.getPrimitive(),s=this.geometry.index,c=this.geometry.attributes.position,l=this.indirect?e=>{let t=this.resolveTriangleIndex(e);Q(o,t*3,s,c)}:e=>{Q(o,e*3,s,c)},u=Aa.getPrimitive(),d=t.geometry.index,f=t.geometry.attributes.position,p=t.indirect?e=>{let n=t.resolveTriangleIndex(e);Q(u,n*3,d,f)}:e=>{Q(u,e*3,d,f)};if(a){if(!(t instanceof e))throw Error(`MeshBVH: "intersectsTriangles" callback can only be used with another MeshBVH.`);let r=(e,t,r,i,s,c,d,f)=>{for(let m=r,h=r+i;m<h;m++){p(m),u.a.applyMatrix4(n),u.b.applyMatrix4(n),u.c.applyMatrix4(n),u.needsUpdate=!0;for(let n=e,r=e+t;n<r;n++)if(l(n),o.needsUpdate=!0,a(o,u,n,m,s,c,d,f))return!0}return!1};if(i){let e=i;i=function(t,n,i,a,o,s,c,l){return e(t,n,i,a,o,s,c,l)?!0:r(t,n,i,a,o,s,c,l)}}else i=r}return super.bvhcast(t,n,{intersectsRanges:i})}intersectsBox(e,t){return qo.set(e.min,e.max,t),qo.needsUpdate=!0,this.shapecast({intersectsBounds:e=>qo.intersectsBox(e),intersectsTriangle:e=>qo.intersectsTriangle(e)})}intersectsSphere(e){return this.shapecast({intersectsBounds:t=>e.intersectsBox(t),intersectsTriangle:t=>t.intersectsSphere(e)})}closestPointToGeometry(e,t,n={},r={},i=0,a=1/0){return(this.indirect?Go:Co)(this,e,t,n,r,i,a)}closestPointToPoint(e,t={},n=0,r=1/0){return Na(this,e,t,n,r)}};function es(e,t,n){let r=360/n,i=Math.round((e.datumAngle-t)/r);if(i=(i%n+n)%n,i===0)return e;let a=new Float64Array(e.r.length);for(let t=0;t<e.nTheta;t++){let n=(t+i)%e.nTheta;a.set(e.r.subarray(n*e.nx,(n+1)*e.nx),t*e.nx)}return{...e,r:a,nTheta:n,datumAngle:t}}function ts(e,t,n,r,i,a,o){let s=new Bt;s.setAttribute(`position`,new At(Float32Array.from(e),3));let c=new $o(s,{targetLeafSize:1}),l=new Float64Array(r*i).fill(1/0),u=new Ie,d=2*Math.PI/i;for(let e=0;e<i;e++){let i=e*d,s=Math.sin(i),f=Math.cos(i);u.direction.set(0,-s,-f),u.origin.set(0,(a+10)*s,o+(a+10)*f);for(let i=0;i<r;i++){u.origin.x=t+i*n;let a=c.raycastFirst(u,2);if(a){let t=Math.hypot(a.point.y,a.point.z-o);t<l[e*r+i]&&(l[e*r+i]=t)}}}return s.dispose(),l}function ns(e,t,n,r,i,a,o,s){let c=new Bt;c.setAttribute(`position`,new At(Float32Array.from(e),3));let l=new $o(c,{targetLeafSize:1}),u=new Uint8Array(r*i),d=2*Math.PI/i,f=new Ie;for(let e=0;e<i;e++){let i=e*d,c=Math.sin(i),p=Math.cos(i);f.direction.set(0,-c,-p),f.origin.set(0,(a+10)*c,o+(a+10)*p);for(let i=0;i<r;i++){if(!(s[e*r+i]<a-1e-9))continue;f.origin.x=t+i*n;let o=l.raycast(f,2);if(o.length<2)continue;let c=o.map(e=>e.distance).sort((e,t)=>e-t),d=1;for(let e=1;2*e<c.length;e++)c[2*e]-c[2*e-1]>.05&&d++;d>=2&&(u[e*r+i]=1)}}return c.dispose(),u}function rs(e,t,n,r,i,a){let o=a.diameter/2,s=a.type===`ball`,c=2*Math.PI/n,l=Math.ceil(o/r),u=i*2*Math.PI/n,d=Math.ceil(o/u)+1,f=new Float64Array(t*n).fill(-1/0);for(let i=0;i<n;i++)for(let a=0;a<t;a++){let u=e[i*t+a];if(u===1/0)continue;let p=u*c,m=p>0?Math.min(d,Math.ceil(o/p)):d;for(let e=-m;e<=m;e++){let c=((i+e)%n+n)%n;for(let n=-l;n<=l;n++){let i=a+n;if(i<0||i>=t)continue;let l=Math.hypot(n*r,e*p);if(l>o)continue;let d=s?u+Math.sqrt(o*o-l*l)-o:u,m=c*t+i;d>f[m]&&(f[m]=d)}}}return f}function is(e){let t={moves:[],estimatedMinutes:0,warnings:[],standing:{r:/* @__PURE__ */ new Float64Array,nx:0,nTheta:0,pitchX:0,gx0:0,radius:0,axisZ:0,datumAngle:0},stats:{levels:0,wraps:0,rows:0,blockedCells:0}};if(e.positions.length<9)return t;if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.stepOver<=0)throw Error(`stepOver must be positive`);if(e.allowance<0)throw Error(`allowance must not be negative`);if(e.x1<=e.x0)throw Error(`the stock span is empty`);if(e.radius<=0)throw Error(`the stock radius must be positive`);if(e.feed<=0||e.plungeFeed<=0)throw Error(`feeds must be positive`);let n=e.strategy??`horizontal`,r=e.axisZ+e.radius+e.safeClearance,i=1/0,a=-1/0;for(let t=0;t<e.positions.length;t+=3){let n=e.positions[t];n<i&&(i=n),n>a&&(a=n)}if(a<=e.x0||i>=e.x1)throw Error(`the model does not overlap the stock span`);let o=e.stepOver/2,s=e.x0,c=e.x1,l=Math.floor((c-s)/o)+1,u=Math.max(24,Math.round(2*Math.PI*e.radius/e.stepOver)),d=360/u,f=ts(e.positions,s,o,l,u,e.radius,e.axisZ),p=rs(f,l,u,o,e.radius,e.tool),m=ns(e.positions,s,o,l,u,e.radius,e.axisZ,f),h=0;for(let e=0;e<m.length;e++)h+=m[e];let g=new Float64Array(l*u),_=e.radius;for(let t=0;t<g.length;t++)p[t]!==-1/0&&p[t]+e.allowance<_&&(_=p[t]+e.allowance);for(let t=0;t<g.length;t++)g[t]=p[t]===-1/0?_:p[t]+e.allowance;let v=_,y=e.radius-v,b=[];if(!e.finishingOnly&&y>0){let t=Math.ceil(y/e.stepDown);for(let n=1;n<t;n++)b.push(e.radius-n*y/t)}let x=e.standing&&e.standing.nx===l?e.standing.nTheta===u&&e.standing.pitchX===o&&e.standing.gx0===s?es(e.standing,e.datumAngle,u):e.standing:{r:b.length===0?Float64Array.from(g):new Float64Array(l*u).fill(e.radius),nx:l,nTheta:u,pitchX:o,gx0:s,radius:e.radius,axisZ:e.axisZ,datumAngle:e.datumAngle};if(x.r.length!==l*u)throw Error(`standing grid must be nx × nTheta (thread the grid from the prior op of the same stock)`);let S=e=>{for(let t=0;t<x.r.length;t++)g[t]<e-1e-9&&x.r[t]>e&&(x.r[t]=e)},C=[],w=[],T=0,E=0,D=0,O=(e.startA??0)+ar(e.datumAngle,e.startA??0),k=0,ee=e=>{let t=e-k;return t<0&&(t+=u),t},A=e=>{O+=ee(e)*d,k=e},te=e=>{let t=e+1===u?0:e+1,n=t-k;n<=0&&(n+=u),O+=n*d,k=t},j=r,ne=e=>{Math.abs(e-j)<1e-9||(C.push({words:{z:e},feed:0,rapid:!0}),j=e)},M=()=>ne(r),re=(t,n)=>{C.push({words:{z:n},feed:e.plungeFeed}),T+=Math.max(0,t-n)/e.plungeFeed,j=n},ie=(e,t,n)=>x.r[t*l+e],ae=(e,t,n,r)=>{let i=-1/0;for(let a=Math.min(e,t);a<=Math.max(e,t);a++){let e=ie(a,n,r);e>i&&(i=e)}return i},oe=(e,t,n,r)=>{let i=-1/0,a=(t-e+u)%u;for(let t=0;t<=a;t++){let a=ie(n,(e+t)%u,r);a>i&&(i=a)}return i},N=-1,se=(t,n,r,i)=>{let a=N<0||t===null?-1/0:oe(k,t,N,i),c=N<0?-1/0:ae(N,n,t===null?k:t,i),l=e.axisZ+Math.max(a,c,r,N<0||i<=0&&b.length>0?e.radius:-1/0)+1;j<l&&ne(l),t!==null&&(A(t),C.push({words:{a:O},feed:0,rapid:!0})),N!==n&&C.push({words:{x:s+n*o},feed:0,rapid:!0}),re(j,e.axisZ+r),N=n},ce=(t,n)=>{let r=[];for(let i=0;i<l;i++){let a=g[n*l+i];if(!(t===null?a<e.radius-1e-9:a<t-1e-9))continue;let o=r.length-1;o>=0&&r[o][1]===i-1?r[o][1]=i:r.push([i,i])}return r},le=(t,n)=>{let r=[];for(let i=0;i<u;i++){let a=g[i*l+n];if(!(t===null?a<e.radius-1e-9:a<t-1e-9))continue;let o=r.length-1;o>=0&&r[o][1]===i-1?r[o][1]=i:r.push([i,i])}return r},P=2*Math.PI*e.radius/u,ue=Math.max(1,Math.round(e.stepOver/P)),de=()=>{let e=[];for(let t=0;t<u;t++)e.push(t);return e},F=()=>{let e=[];for(let t=0;t<l;t+=ue)e.push(t);return e},fe=t=>Math.min(e.feed*360/(2*Math.PI*t),ir),pe=n===`spiralWrap`,me=(pe?Math.max(1,Math.ceil((l-1)*o/e.stepOver)):0)*u,he=pe?t=>Math.min(l-1,Math.round(t*e.stepOver/(u*o))):()=>0,ge=pe?t=>{let n=[];for(let r=0;r<me;r++){let i=g[r%u*l+he(r)];if(!(t===null?i<e.radius-1e-9:i<t-1e-9))continue;let a=n.length-1;a>=0&&n[a][1]===r-1?n[a][1]=r:n.push([r,r])}return n}:()=>[],_e=pe?(t,n)=>{M(),A(t%u),C.push({words:{a:O},feed:0,rapid:!0});let r=he(t);C.push({words:{x:s+r*o},feed:0,rapid:!0}),re(j,e.axisZ+n),N=r}:()=>{};b.forEach((t,r)=>{if(E++,n===`horizontal`)for(let n of de()){let i=ce(t,n);if(i.length===0)continue;D++;let a=n%2==0,c=!0;for(let[l,u]of i){let i=a?l:u,d=a?u:l;se(c?n:null,i,t,r),c=!1,C.push({words:{x:s+d*o},feed:e.feed}),T+=(d-i)*o/e.feed}}else if(n===`vertical`)for(let e of F()){let n=le(t,e);if(n.length!==0){D++;for(let[i,a]of n){se(i,e,t,r);let n=(a-i+1)*d;te(a),C.push({words:{a:O},feed:fe(t)}),T+=n/fe(t)}}}else for(let[n,r]of ge(t))if(D++,_e(n,t),r>n){let i=s+he(n)*o,a=s+he(r)*o,c=(r-n)*d,l=c*Math.PI*t/180,f=Math.max(Math.hypot(a-i,l)/e.feed,(r-n)*(d/360)/rr);O+=c,k=r%u,C.push({words:{x:a,a:O},feed:1/f,comment:`helix r${t.toFixed(2)}`}),T+=f,N=he(r)}S(t)}),E++;let I=0;if(n===`horizontal`){let t=!1;for(let n of de()){let r=ce(null,n);if(r.length===0)continue;D++;let i=t;t=!t;let a=!0;for(let[t,c]of r){let r=i?t:c,u=i?c:t,d=i?1:-1,f=g[n*l+r],p=e.radius-f;p>I&&(I=p),se(a?n:null,r,f,b.length),a=!1;let m=s+r*o,h=f;for(let t=r+d;t!==u+d;t+=d){let r=g[n*l+t],i=s+t*o;C.push({words:{x:i,z:e.axisZ+r},feed:e.feed}),T+=Math.hypot(i-m,r-h)/e.feed,m=i,h=r}}}}else if(n===`vertical`)for(let t of F()){let n=le(null,t);if(n.length!==0){D++;for(let[r,i]of n){let n=g[r*l+t],a=e.radius-n;a>I&&(I=a),se(r,t,n,b.length);let o=O,s=n;for(let n=r+1;n<=i;n++){let r=g[n*l+t];te(n-1);let i=Math.abs(O-o)*(Math.PI/180)*Math.max(r,s),a=Math.max(Math.hypot(i,r-s)/e.feed,Math.abs(O-o)/360/rr);C.push({words:{a:O,z:e.axisZ+r},feed:1/a}),T+=a,o=O,s=r}}}}else for(let[t,n]of ge(null)){D++;let r=he(t),i=g[t%u*l+r],a=e.radius-i;a>I&&(I=a),_e(t,i);let c=O,d=i,f=s+r*o;for(let r=t+1;r<=n;r++){let t=r%u,n=he(r),i=g[t*l+n],a=s+n*o;A(t);let p=Math.abs(O-c)*(Math.PI/180)*Math.max(i,d),m=Math.max(Math.hypot(p,a-f,i-d)/e.feed,Math.abs(O-c)/360/rr);C.push({words:{x:a,a:O,z:e.axisZ+i},feed:1/m}),T+=m,c=O,d=i,f=a}N=he(n)}if(M(),!e.finishingOnly||b.length>0)for(let e=0;e<u;e++)for(let t=0;t<l;t++){let n=g[e*l+t];n<x.r[e*l+t]&&(x.r[e*l+t]=n)}return h>0&&w.push(`${h} grid cell(s) have material behind an air gap along the ray — this op cuts the outer surface only; that material is unreachable (radial shadow)`),I>2&&!e.finishingOnly&&w.push(`the surface sits ${I.toFixed(1)}mm below the stock radius — run the roughing ladder first (this pass buried the tool deeper than it should)`),e.finishingOnly&&I>2&&w.push(`finishing pass only, but the surface sits ${I.toFixed(1)}mm below the stock radius — untick "finishing pass only" so the ladder clears the bulk first`),{moves:C,estimatedMinutes:T,warnings:w,standing:x,stats:{levels:b.length,wraps:E,rows:D,blockedCells:h}}}function as(e){if(e.x1<=e.x0)throw Error(`the stock span is empty`);if(e.radius<=0)throw Error(`the stock radius must be positive`);if(e.thetaStepOver<=0)throw Error(`thetaStepOver must be positive`);if(e.orientations.length===0)throw Error(`at least one orientation is needed`);let t=new Bt;t.setAttribute(`position`,new At(Float32Array.from(e.positions),3));let n=new $o(t,{targetLeafSize:1}),r=e.thetaStepOver/2,i=Math.floor((e.x1-e.x0)/r)+1,a=Math.max(24,Math.round(2*Math.PI*e.radius/e.thetaStepOver)),o=i*a,s=2*Math.PI/a,c=ts(e.positions,e.x0,r,i,a,e.radius,e.axisZ),l=Math.floor(2*e.radius/r)+1,u=e.tool.diameter/2,d=Math.max(0,Math.ceil(u/r)),f=e.offset??.5,p=new Ie,m=new Uint8Array(e.orientations.length*o),h=[],g=new Float64Array(i*l),_=new Float64Array(i*l);for(let t=0;t<e.orientations.length;t++){let u=e.orientations[t]*Math.PI/180,v=Math.cos(u),y=Math.sin(u);for(let t=0;t<l;t++){let a=-e.radius+t*r;for(let o=0;o<i;o++){let s=e.x0+o*r,c=e.radius+10,l=a*v+c*y,u=-a*y+c*v;p.origin.set(s,l,e.axisZ+u),p.direction.set(0,-y,-v);let d=n.raycastFirst(p,2);if(d){let n=d.point.z-e.axisZ;g[t*i+o]=d.point.y*y+n*v+e.axisZ}else g[t*i+o]=-1/0}}for(let e=0;e<l;e++)for(let t=0;t<i;t++){let n=-1/0;for(let r=-d;r<=d;r++){let a=e+r;if(!(a<0||a>=l))for(let e=-d;e<=d;e++){let o=t+e;if(o<0||o>=i||e*e+r*r>d*d)continue;let s=g[a*i+o];s>n&&(n=s)}}_[e*i+t]=n}let b=0;for(let n=0;n<a;n++){let a=n*s,u=Math.sin(a),p=Math.cos(a);for(let a=0;a<i;a++){let s=n*i+a,h=c[s];if(h===1/0)continue;let g=h+f,x=g*u,S=g*p,C=x*v-S*y,w=x*y+S*v+e.axisZ,T=Math.round((C+e.radius)/r);if(T<0||T>=l)continue;let E=1/0;for(let e=-d;e<=d;e++){let t=T+e;if(!(t<0||t>=l))for(let n=-d;n<=d;n++){let r=a+n;if(r<0||r>=i||n*n+e*e>d*d)continue;let o=_[t*i+r];o<E&&(E=o)}}E<=w+r+.001&&(m[t*o+s]=1,b++)}}h.push(b)}let v=0,y=0;for(let t=0;t<o;t++)if(c[t]!==1/0){v++;for(let n=0;n<e.orientations.length;n++)if(m[n*o+t]===1){y++;break}}return t.dispose(),{cleared:m,nx:i,nTheta:a,orientations:[...e.orientations],materialCells:v,coverable:y,buriedEverywhere:v-y,clearedPerOrientation:h}}function os(e){let t=e.nx*e.nTheta,n=new Uint8Array(t),r=new Uint8Array(e.orientations.length),i=[],a=0;for(;;){let o=-1,s=0;for(let i=0;i<e.orientations.length;i++){if(r[i])continue;let a=0;for(let r=0;r<t;r++)!n[r]&&e.cleared[i*t+r]===1&&a++;a>s&&(s=a,o=i)}if(o<0||s===0)break;r[o]=1;for(let r=0;r<t;r++)!n[r]&&e.cleared[o*t+r]===1&&(n[r]=1,a++);if(i.push({angle:e.orientations[o],gain:s,total:a}),i.length>=e.orientations.length)break}return{picks:i,covered:a}}let ss=1e-4,cs=1e-9;function ls(e){let t=e.thetaStepOver/2,n=Math.floor((e.x1-e.x0)/t)+1,r=Math.max(24,Math.round(2*Math.PI*e.radius/e.thetaStepOver));return{pitchX:t,nx:n,nTheta:r,dTheta:2*Math.PI/r}}function us(e){let t=ls(e);return{r:new Float64Array(t.nx*t.nTheta).fill(e.radius),nx:t.nx,nTheta:t.nTheta,pitchX:t.pitchX,gx0:e.x0,radius:e.radius,axisZ:e.axisZ,datumAngle:e.datumAngle}}function ds(e,t){let n=us(t);if(!e||e.r.length===0)return n;if(e.nx===n.nx&&e.nTheta===n.nTheta&&Math.abs(e.pitchX-n.pitchX)<=cs&&Math.abs(e.gx0-n.gx0)<=cs&&Math.abs(e.radius-n.radius)<=cs&&Math.abs(e.axisZ-n.axisZ)<=cs){let n=es(e,t.datumAngle,e.nTheta);return{...n,r:new Float64Array(n.r)}}let r=2*Math.PI/n.nTheta,i=2*Math.PI/e.nTheta,a=t.datumAngle*Math.PI/180,o=e.datumAngle*Math.PI/180;for(let s=0;s<n.nTheta;s++){let c=s*r-a,l=(r+i)/2+i,u=Math.ceil((c-o-l)/i),d=Math.floor((c+l-o)/i);for(let r=0;r<n.nx;r++){let i=t.x0+r*n.pitchX,a=(n.pitchX+e.pitchX)/2+e.pitchX,o=i-e.gx0,c=Math.max(0,Math.ceil((o-a)/e.pitchX)),l=Math.min(e.nx-1,Math.floor((o+a)/e.pitchX)),f=-1;for(let t=u;t<=d;t++){let n=(t%e.nTheta+e.nTheta)%e.nTheta;for(let t=c;t<=l;t++){let r=e.r[n*e.nx+t];r>f&&(f=r)}}n.r[s*n.nx+r]=Math.min(f<0?n.radius:f,t.radius)}}return n}function fs(e,t,n){let r=t*Math.PI/180,i=e.nTheta,a=2*Math.PI/i,o=new Float64Array(i),s=new Float64Array(i),c=new Float64Array(i);for(let e=0;e<i;e++){let t=e*a-r;o[e]=Math.cos(t),s[e]=Math.sin(t);let n=Math.max(0,Math.abs(Math.atan2(s[e],o[e]))-a/2);c[e]=Math.cos(n)}let l=t=>e.gx0+t*e.pitchX,u={grid:e,angleDeg:t,cosRow:e=>o[e],sinRow:e=>s[e],rCut:(t,n)=>(t-e.axisZ)/o[n],rTop:(t,n)=>Math.min(Math.max((t-e.axisZ)/o[n],0),e.radius),hasWork:(t,n,r,i)=>{let a=o[n];if(Math.abs(a)<ss)return!0;if(a>0){let r=(i-e.axisZ)/a;return r<=0||e.r[n*e.nx+t]>r}return i<e.axisZ-cs}},d=(t,n,r)=>{let i=e.r[n*e.nx+t],a=r-e.axisZ,o=c[n];if(o>0){let e=Math.max(0,a/o);return e<i?[e,i]:null}if(a>=-1e-9)return null;let s=Math.min(i,a/o);return s>cs?[0,s]:null},f=(t,r,o)=>{let c=!1;gate:for(let t=0;t<i;t++)for(let n=0;n<e.nx;n++)if(d(n,t,r)!==null){c=!0;break gate}if(!c)return[];let u=e.radius*2*Math.sin(a/2)+cs,f=n===void 0?0:n+.05,p=1/0,m=-1/0;for(let e of o)for(let t of e)t.y<p&&(p=t.y),t.y>m&&(m=t.y);if(!Number.isFinite(p))return[];let h=[],g=[];for(let t=0;t<e.nx;t++){g.length=0;for(let e=0;e<i;e++){let n=d(t,e,r);if(!n)continue;let i=Math.min(n[0]*s[e],n[1]*s[e])-u,a=Math.max(n[0]*s[e],n[1]*s[e])+u;if(a-i<f){let e=(i+a)/2;g.push([e-f/2,e+f/2])}else g.push([i,a])}g.sort((e,t)=>e[0]-t[0]);let n=l(t)-e.pitchX/2-cs,a=l(t)+e.pitchX/2+cs,o=p;for(let e=0;e<g.length;e++)g[e][0]>o&&h.push([{x:n,y:o},{x:a,y:o},{x:a,y:g[e][0]},{x:n,y:g[e][0]}]),g[e][1]>o&&(o=g[e][1]);o<m&&h.push([{x:n,y:o},{x:a,y:o},{x:a,y:m},{x:n,y:m}])}let _=o;for(let e=0;e<h.length;e+=200)if(_=Rr(_,h.slice(e,e+200)),_.length===0)return[];return _},p=(t,n,r)=>{if(r.length===0)return t;let a=1/0,o=1/0,u=-1/0,f=-1/0;for(let e of r)for(let t of e)t.x<a&&(a=t.x),t.x>u&&(u=t.x),t.y<o&&(o=t.y),t.y>f&&(f=t.y);let p=-1/0;for(let t=0;t<i;t++){let i=c[t],h=s[t];for(let s=0;s<e.nx;s++){if(d(s,t,n)===null)continue;let c=l(s),g=e.r[t*e.nx+s],_=g*h;if(c<a||c>u||_<o||_>f)continue;let v=e.axisZ+g*i;v>p&&m({x:c,y:_},r)&&(p=v)}}return p>n?p:t},m=(e,t)=>{for(let n of t)if(h(e,n))return!0;return!1},h=(e,t)=>{let n=!1;for(let r=0,i=t.length-1;r<t.length;i=r++){let a=t[r].x,o=t[r].y,s=t[i].x,c=t[i].y;o>e.y!=c>e.y&&e.x<(s-a)*(e.y-o)/(c-o)+a&&(n=!n)}return n};return{trimBand:f,stampBand:(t,n,r)=>{if(r.length===0)return;let a=1/0,c=1/0,u=-1/0,d=-1/0;for(let e of r)for(let t of e)t.x<a&&(a=t.x),t.y<c&&(c=t.y),t.x>u&&(u=t.x),t.y>d&&(d=t.y);let f=Array(e.nx).fill(null);for(let t=0;t<e.nx;t++){let e=l(t);if(e<a||e>u)continue;let n=[];for(let t of r)for(let r=0,i=t.length-1;r<t.length;i=r++){let a=t[r],o=t[i];a.x>e!=o.x>e&&n.push(o.y+(a.y-o.y)*(e-o.x)/(a.x-o.x))}if(n.length<2)continue;n.sort((e,t)=>e-t);let i=[];for(let e=0;e+1<n.length;e+=2)i.push([n[e],n[e+1]]);f[t]=i}let p=n-e.axisZ;for(let t=0;t<i;t++){let n=o[t];if(n<=ss)continue;let r=Math.max(0,p/n),i=s[t],a=t*e.nx;for(let t=0;t<e.nx;t++){let n=f[t];if(!n)continue;let o=e.r[a+t];if(o<=r+cs)continue;let s=r*i,c=o*i,l=Math.min(s,c),u=Math.max(s,c);for(let[i,o]of n)if(l>=i&&u<=o){e.r[a+t]=r;break}}}},view:u,computeCeiling:p,entryClear:(t,n,r,a)=>{let o=e.pitchX,u=Math.ceil((n-a-e.gx0)/o),d=Math.floor((n+a-e.gx0)/o);if(u<0||d>=e.nx)return!1;let f=t-e.axisZ;for(let t=u;t<=d;t++){let o=l(t)-n,u=Math.sqrt(Math.max(0,a*a-o*o));for(let n=0;n<i;n++){let i=s[n],a=c[n],o=e.r[n*e.nx+t],l=o*i,d=Math.min(0,l);if(!(Math.max(0,l)<r-u||d>r+u)){if(a>0){if(o>f/a)return!1}else if(f<-1e-9&&o>cs)return!1}}}return!0},sweptClear:(t,n,r,a)=>{let o=e.pitchX,u=Math.ceil((n-a-e.gx0)/o),d=Math.floor((n+a-e.gx0)/o);if(u<0||d>=e.nx)return!1;let f=t-e.axisZ;for(let t=u;t<=d;t++){let o=l(t)-n,u=Math.sqrt(Math.max(0,a*a-o*o));for(let n=0;n<i;n++){let i=s[n],a=c[n],o=e.r[n*e.nx+t],l=o*i,d=Math.min(0,l);if(!(Math.max(0,l)<r-u||d>r+u)&&(a<=ss||o>f/a+cs))return!1}}return!0},segmentClear:(t,n,r,a,o,u)=>{let d=Math.hypot(a-n,o-r),f=Math.min(e.pitchX/4,d>0?d:1/0),p=Math.max(1,Math.ceil(d/f));for(let d=0;d<=p;d++){let f=d/p,m=n+(a-n)*f,h=r+(o-r)*f,g=Math.ceil((m-u-e.gx0)/e.pitchX),_=Math.floor((m+u-e.gx0)/e.pitchX);if(g<0||_>=e.nx)return!1;let v=t-e.axisZ;for(let t=g;t<=_;t++){let n=l(t)-m,r=Math.sqrt(Math.max(0,u*u-n*n));for(let n=0;n<i;n++){let i=s[n],a=e.r[n*e.nx+t],o=a*i,l=Math.min(0,o);if(Math.max(0,o)<h-r||l>h+r)continue;let u=c[n];if(u>ss){if(a>v/u+cs)return!1}else if(v<-1e-9&&a>cs)return!1}}}return!0}}}function ps(e){let t=e.grid.datumAngle===0?e.grid:es(e.grid,0,e.grid.nTheta),n=ts(e.positions,t.gx0,t.pitchX,t.nx,t.nTheta,t.radius,t.axisZ),r=2*Math.PI/t.nTheta,i=new Float64Array(t.nx*t.nTheta),a=!1;for(let r=0;r<i.length;r++){let o=n[r];if(o===1/0)continue;let s=t.r[r]-o;s>e.allowance+.05&&(i[r]=s,a=!0)}if(!a)return{runs:0,thinRuns:0,wideRuns:0,volume:0,thinVolume:0,anyRest:!1,note:null};let o=0,s=0,c=0,l=0,u=0,d=new Uint8Array(t.nx*t.nTheta);for(let a=0;a<t.nx;a++)for(let f=0;f<t.nTheta;f++){if(d[f*t.nx+a]||i[f*t.nx+a]<=0)continue;let p=0,m=0,h=[f];for(;h.length>0;){let e=h.pop(),o=e*t.nx+a;if(d[o]||i[o]<=0)continue;d[o]=1;let s=r*n[o];p+=s,m+=i[o]*s*t.pitchX,h.push((e+1)%t.nTheta,(e-1+t.nTheta)%t.nTheta)}o++,l+=m,p<e.thinBelow?(s++,u+=m):p>=e.toolDiameter&&c++}let f=s===0?null:`${s} thin streamer${s===1?``:`s`} left standing (< ${e.thinBelow.toFixed(1)}mm wide, ~${Math.round(u)}mm³) — finishing stock, not cuttable by the roughing tool`;return{runs:o,thinRuns:s,wideRuns:c,volume:l,thinVolume:u,anyRest:a,note:f}}function ms(e,t){let n=(e.index?e.toNonIndexed():e).getAttribute(`position`),r=new Float32Array(n.count*3),i=new le().setFromEuler(new qe(t.rotationDeg.x*Math.PI/180,t.rotationDeg.y*Math.PI/180,t.rotationDeg.z*Math.PI/180,`XYZ`)),a=new P;for(let e=0;e<n.count;e++)a.fromBufferAttribute(n,e),a.set(a.x*t.scale.x,a.y*t.scale.y,a.z*t.scale.z),a.applyQuaternion(i),r[e*3]=a.x+t.position.x,r[e*3+1]=a.y+t.position.y,r[e*3+2]=a.z+t.position.z;return r}let hs=1e7;function gs(e,t){return`${Math.round(e*hs)} ${Math.round(t*hs)}`}function _s(e){let t=[];for(let n of e)(t.length===0||gs(n.x,n.y)!==gs(t[t.length-1].x,t[t.length-1].y))&&t.push(n);for(;t.length>1&&gs(t[0].x,t[0].y)===gs(t[t.length-1].x,t[t.length-1].y);)t.pop();return t}function vs(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=r.x*i.y-i.x*r.y}return t/2}function ys(e,t){let n=!1;for(let r=0,i=t.length-1;r<t.length;i=r++){let a=t[r],o=t[i];a.y>e.y!=o.y>e.y&&e.x<(o.x-a.x)*(e.y-a.y)/(o.y-a.y)+a.x&&(n=!n)}return n}function bs(e,t){return 1e-6*Math.max(1,Math.abs(e),Math.abs(t))}function xs(e){let t=Math.floor(e.length/9),n=1/0,r=-1/0;for(let t=2;t<e.length;t+=3){let i=e[t];i<n&&(n=i),i>r&&(r=i)}Number.isFinite(n)||(n=0,r=0);let i=r-n,a=Math.max(1,Math.ceil(t/64)),o=i>0?i/a:1,s=bs(n,r),c=Array.from({length:a},()=>[]);for(let r=0;r<t;r++){let t=r*9,i=e[t+2],l=i;for(let n=1;n<3;n++){let r=e[t+n*3+2];r<i&&(i=r),r>l&&(l=r)}if(!Number.isFinite(i)||!Number.isFinite(l))continue;let u=Math.floor((i-s-n)/o),d=Math.floor((l+s-n)/o);u<0&&(u=0),d>a-1&&(d=a-1);for(let e=u;e<=d;e++)c[e].push(r)}return{minZ:n,bucketH:o,buckets:c}}function Ss(e,t,n){let r=1e-9*Math.max(1,Math.abs(t)),i=e=>e>r?1:e<-r?-1:0,a=[],o=n=>{let r=[],o=[],s=[];for(let i=0;i<3;i++){let a=n+i*3;r.push(e[a]),o.push(e[a+1]),s.push(e[a+2]-t)}let c=[i(s[0]),i(s[1]),i(s[2])];if(c[0]===c[1]&&c[1]===c[2])return;let l=[],u=(e,t)=>{l.some(n=>gs(n.x,n.y)===gs(e,t))||l.push({x:e,y:t})};for(let e=0;e<3;e++){let t=(e+1)%3;if(c[e]===0&&u(r[e],o[e]),c[e]*c[t]<0){let n=s[e]/(s[e]-s[t]);u(r[e]+(r[t]-r[e])*n,o[e]+(o[t]-o[e])*n)}}l.length===2&&a.push({a:l[0],b:l[1],used:!1})};if(n){let e=Math.floor((t-n.minZ)/n.bucketH),r=e<0?0:e>=n.buckets.length?n.buckets.length-1:e;for(let e of n.buckets[r])o(e*9)}else{let t=Math.floor(e.length/9);for(let e=0;e<t;e++)o(e*9)}let s=/* @__PURE__ */ new Map;a.forEach((e,t)=>{for(let n of[e.a,e.b]){let e=gs(n.x,n.y),r=s.get(e);r?r.push(t):s.set(e,[t])}});let c=[],l=0,u=(e,t)=>{let n=[],r=a[e];r.used=!0;let i=t?gs(r.a.x,r.a.y):gs(r.b.x,r.b.y),o=t?gs(r.b.x,r.b.y):gs(r.a.x,r.a.y);for(n.push(t?r.a:r.b,t?r.b:r.a);o!==null&&o!==i;){let e=s.get(o)??[],t=-1;for(let n of e)if(!a[n].used){t=n;break}if(t<0)return{chain:n,endKey:null};let r=a[t];r.used=!0;let i=gs(r.a.x,r.a.y);i===o?(n.push(r.b),o=gs(r.b.x,r.b.y)):(n.push(r.a),o=i)}return{chain:n,endKey:o}};for(let e=0;e<a.length;e++){if(a[e].used)continue;let t=u(e,!0);if(t.endKey===null){u(e,!1),l++;continue}let n=_s(t.chain);n.length>=3&&c.push(n)}let d=c.map(e=>({c:e,area:vs(e)})).sort((e,t)=>Math.abs(t.area)-Math.abs(e.area)),f=[];for(let{c:e,area:t}of d){let n=0;for(let t of f)ys(e[0],t)&&n++;let r=n%2==0;f.push(t>0===r?e:[...e].reverse())}return{contours:f,droppedChains:l}}let Cs=e=>e.toFixed(2),ws=.01;function Ts(e){let t=0;for(let n of e){let e=0;for(let t=0;t<n.length;t++){let r=n[t],i=n[(t+1)%n.length];e+=r.x*i.y-i.x*r.y}t+=Math.abs(e/2)}return t}function Es(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=r.x*i.y-i.x*r.y}return t/2}function Ds(e,t){let n=!1;for(let r=0,i=t.length-1;r<t.length;i=r++){let a=t[r].x,o=t[r].y,s=t[i].x,c=t[i].y;o>e.y!=c>e.y&&e.x<(s-a)*(e.y-o)/(c-o)+a&&(n=!n)}return n}function Os(e){let t=e.length,n=Array(t).fill(0);for(let r=0;r<t;r++)for(let i=0;i<t;i++)r!==i&&Ds(e[r][0],e[i])&&n[r]++;return e.map((e,t)=>{let r=n[t]%2==0;return Es(e)>0===r?e:e.slice().reverse()})}function ks(e){if(e.stepDown<=0)throw Error(`stepDown must be positive`);if(e.stepOver<=0)throw Error(`stepOver must be positive`);if(e.allowance<0)throw Error(`allowance must not be negative`);if(e.margin<0)throw Error(`margin must not be negative`);let t=e.maxDepth!==void 0&&e.maxDepth>0?Math.max(e.floorZ,e.topZ-e.maxDepth):e.floorZ;if(!(t<e.topZ))throw Error(`the model floor is at/above the stock crown — nothing to rough`);let n=xr(e.topZ,t,e.stepDown),r=e.topZ-t,i=Math.ceil(r/e.stepDown),a=i>0?r/i:0,o=n.map((t,r)=>({bandTop:r===0?e.topZ:n[r-1],cut:t+e.allowance})),s=xs(e.positions),c=/* @__PURE__ */ new Map,l=t=>{let n=c.get(t);if(n)return n;let r=Ss(e.positions,t,s),i={contours:Os(r.contours.map(e=>wr(e,ws))),droppedChains:r.droppedChains};return c.set(t,i),i},u=[];for(let e of o)u.push(l(e.cut).contours,l(e.bandTop).contours);let d=Ir(u.flat()),f=0;for(let e of c.values())f+=e.droppedChains;let p=d.length===0?[]:Fr(d,e.margin),m;if(e.clearToStock&&d.length>0){if(!e.footprint||e.footprint.length===0)throw Error(`clear excess stock needs the stock footprint — turn off tail stock cut-over`);m=Lr(d,e.footprint).length>0?e.footprint:[]}else m=p.length===0||!e.footprint||e.footprint.length===0?p:Lr(p,e.footprint);let h=[],g=[],_=[],v=0,y=0,b=0,x=0,S=0,C=0,w=!1,T=!1,E=[...c.keys()].sort((e,t)=>t-e),D=0,O=[],k=0;for(let r=0;r<o.length;r++){let{bandTop:i,cut:s}=o[r];if(!e.finishingOnly&&s>=i){b++,S++;continue}let u=l(s);for(!w&&u.contours.length>0&&Ts(l(i).contours)>Ts(u.contours)*(1+1e-9)+1e-9&&(_.push(`undercut between z${Cs(i)} and z${Cs(s)} — 3-axis roughing cannot reach under overhangs; check the preview`),w=!0);D<E.length&&E[D]>=s-1e-9;){let e=c.get(E[D]).contours;O=O.length===0?e:Ir([...O,...e]),D++}let f,p=O;if(m.length===0?f=[]:O.length===0?f=m:(p=e.allowance>0?Fr(O,e.allowance):O,f=Rr(m,p)),f.length===0){b++;continue}let ee=Lr(f,d).length===0;if(ee){if(k++,k>=2){_.push(`ladder stopped at z${Cs(s)}: levels below only clear the moat — cut out with a profile op (tabs)`);break}}else k=0;let A=null;if(e.finishingOnly&&!ee){if(A=Rr(l((r+1<n.length?n[r+1]:Math.max(t,s-a))+e.allowance).contours,O),p.length===0&&A.length===0){b++;continue}let i=p.length>0?Fr(p,e.tool.diameter+e.stepOver):[],o=A.length>0?Fr(A,e.tool.diameter/2):[],c=Rr(Lr(o.length===0?i:i.length===0?o:Ir([...i,...o]),m),p);if(c.length===0){b++;continue}f=c}let te;if(e.standing){let t=e.standing.trimBand(i,s,f);if(t.length===0){x++;continue}f=t}if(e.clearToStock&&!T){let t=e.tool.diameter/2,n=Fr(Pr(f,t),t);Ts(Rr(f,n))>1&&(_.push(`stock the tool cannot reach below z${Cs(s)} — a gap narrower than the tool (e.g. between the model and the stock end); left standing`),T=!0)}if(e.standing?.computeCeiling){let t=e.tool.diameter/2,n=Fr(Pr(f,t),t),r=e.standing.computeCeiling(i,s,n);te=Math.max(i,Math.min(r,i+e.stepDown))}let j=Math.max(i,te??-1/0)+br,ne=e.standing?.sweptClear?{sweptClear:e.standing.sweptClear,zSafe:j}:void 0,M=e.standing?.segmentClear?(t,n,r,i)=>e.standing.segmentClear(t,n.x,n.y,r.x,r.y,i):void 0,re=f.map(e=>wr(e,ws)),ie={kind:`pocket`,id:`waterline`,toolId:e.tool.id,regions:re,topZ:Math.max(i,s),approachCeiling:te,travelZ:e.topZ+e.safeClearance,floorZ:s,stepDown:Math.max(i-s,1e-9),stepOver:e.stepOver,feed:e.feed,plungeFeed:e.plungeFeed,safeClearance:e.safeClearance};try{let t=si(ie,e.tool,{minLoopPerimeter:e.tool.diameter,leadIn:ne,sweptCorridor:M});if(h.push(...t.moves),g.push(s),v+=t.passes,y+=t.estimatedMinutes,C+=t.droppedLoops,e.standing){let n=e.tool.diameter/2,r=t.orbits.flatMap(e=>oi(e,n)),a=r.length>0?Ir(r):[];e.standing.stampBand(i,s,a)}}catch(e){let t=e instanceof Error?e.message:String(e);if(!/does not fit/.test(t))throw e;_.push(`level at z${Cs(s)} — clearing frame thinner than the tool there, left standing`)}}return S>0&&_.push(`allowance ≥ increment: ${S} level(s) had no band left to clear`),e.maxDepth!==void 0&&e.maxDepth>0&&t>e.floorZ+1e-9&&_.push(`max depth ${e.maxDepth}mm: ladder stops at z${Cs(t)} — ${Cs(e.floorZ)} floor left standing (deeper cuts exceed the set depth; raise Max depth for a longer flute)`),C>0&&_.push(`${C} sliver pass(es) thinner than the tool dropped — left for the finishing op`),{moves:h,levels:g,passes:v,estimatedMinutes:y,droppedChains:f,skippedLevels:b,standingSkips:x,warnings:_}}function As(e,t,n){let r=!1;for(let i of n)for(let n=0,a=i.length-1;n<i.length;a=n++){let o=i[n].y,s=i[a].y;o>t!=s>t&&e<(i[a].x-i[n].x)*(t-o)/(s-o)+i[n].x&&(r=!r)}return r}function js(e,t,n,r,i,a,o,s){let c=new Bt;c.setAttribute(`position`,new At(Float32Array.from(e),3));let l=new $o(c,{targetLeafSize:1}),u=-1/0;for(let t=2;t<e.length;t+=3)e[t]>u&&(u=e[t]);u+=10;let d=new Float64Array(r*i).fill(1/0),f=new Ie;f.direction.set(0,0,-1),f.origin.z=u;for(let e=0;e<i;e++){let i=n+e*a;for(let n=0;n<r;n++){let c=t+n*a;f.origin.x=c*o-i*s,f.origin.y=c*s+i*o;let u=l.raycastFirst(f,2);u&&(d[e*r+n]=u.point.z)}}return c.dispose(),d}function Ms(e,t,n,r,i){let a=i.diameter/2,o=Math.ceil(a/r),s=i.type===`ball`,c=new Float64Array(t*n).fill(-1/0);for(let i=0;i<n;i++)for(let l=0;l<t;l++){let u=e[i*t+l];if(u!==1/0)for(let e=-o;e<=o;e++){let d=i+e;if(!(d<0||d>=n))for(let n=-o;n<=o;n++){let i=l+n;if(i<0||i>=t)continue;let o=Math.hypot(n*r,e*r);if(o>a)continue;let f=s?u+Math.sqrt(a*a-o*o)-a:u,p=d*t+i;f>c[p]&&(c[p]=f)}}}return c}function Ns(e){if(e.pitch<=0)throw Error(`pitch must be positive`);if(e.stepOver<=0)throw Error(`stepOver must be positive`);if(e.allowance<0)throw Error(`allowance must not be negative`);if(e.bottomZ>=e.topZ)throw Error(`the stock bottom is at/above the crown`);if(e.positions.length<9)return{moves:[],rows:0,estimatedMinutes:0,maxPlunge:0,warnings:[]};let t=1/0,n=-1/0,r=1/0,i=-1/0;for(let a=0;a<e.positions.length;a+=3){let o=e.positions[a],s=e.positions[a+1];o<t&&(t=o),o>n&&(n=o),s<r&&(r=s),s>i&&(i=s)}let a=e.tool.diameter/2,o=a+e.pitch,s=((e.angleDeg??0)%360+360)%360*Math.PI/180,c=Math.cos(s),l=Math.sin(s),u=(e,t)=>e*c+t*l,d=(e,t)=>-e*l+t*c,f=1/0,p=-1/0,m=1/0,h=-1/0;for(let[e,a]of[[t,r],[n,r],[t,i],[n,i]]){let t=u(e,a),n=d(e,a);t<f&&(f=t),t>p&&(p=t),n<m&&(m=n),n>h&&(h=n)}f-=o,m-=o,p+=o,h+=o;let g=e.clearToStock&&e.footprint&&e.footprint.length>0?e.cutBeyondStock?Fr(e.footprint,a+e.pitch):e.footprint:null;if(g)for(let t of g)for(let n of t){let t=u(n.x,n.y),r=d(n.x,n.y);t-e.pitch<f&&(f=t-e.pitch),t+e.pitch>p&&(p=t+e.pitch),r-e.pitch<m&&(m=r-e.pitch),r+e.pitch>h&&(h=r+e.pitch)}let _=Math.floor((p-f)/e.pitch)+1,v=Math.floor((h-m)/e.pitch)+1,y=null;if(g){y=new Uint8Array(_*v);for(let t=0;t<v;t++){let n=m+t*e.pitch;for(let r=0;r<_;r++){let i=f+r*e.pitch;As(i*c-n*l,i*l+n*c,g)&&(y[t*_+r]=1)}}}let b=Ms(js(e.positions,f,m,_,v,e.pitch,c,l),_,v,e.pitch,e.tool),x=Math.max(1,Math.round(e.stepOver/e.pitch)),S=e.topZ+e.safeClearance,C=[],w=[],T=0,E=0,D=0,O=0,k=0,ee=!1,A=(t,n)=>{let r=b[n*_+t];if(r===-1/0){if(y!==null&&y[n*_+t]===1){let t=Math.max(e.clearFloorZ??e.bottomZ,e.bottomZ);return t<e.topZ-1e-9?t:null}return null}let i=r+e.allowance;return i<e.topZ-1e-9?i<e.bottomZ?(k++,e.bottomZ):i:null},te=e.stepDown&&e.stepDown>0?e.stepDown:0,j=1/0;for(let e=0;e<v;e++)for(let t=0;t<_;t++){let n=A(t,e);n!==null&&n<j&&(j=n)}let ne=e.topZ-j,M=[];if(te>0&&ne>0){let t=Math.ceil(ne/te);for(let n=1;n<t;n++)M.push(Math.max(e.topZ-n*ne/t,e.bottomZ))}M.push(null);let re=(e,t,n)=>{let r=A(t,n);return r===null?null:e===null?r:r>=e-1e-9?null:e};for(let t of M)for(let n=0;n<v;n+=x){let r=m+n*e.pitch,i=!ee;ee=!ee;let a=[];for(let e=0;e<_;e++){let r=i?e:_-1-e,o=re(t,r,n)!==null,s=a.length-1;o&&(s>=0&&a[s].i1===(i?r-1:r+1)?a[s].i1=r:a.push({i0:r,i1:r}))}if(a.length!==0){T++;for(let{i0:o,i1:s}of a){let a=f+o*e.pitch,u=f+s*e.pitch,d=re(t,o,n),p=[{u:a,z:d}],m=i?1:-1,h=d;for(let r=o+m;r!==s+m;r+=m){let i=re(t,r,n);i!==null&&Math.abs(i-h)>.005&&(p.push({u:f+r*e.pitch,z:i}),h=i)}p[p.length-1].u!==u&&p.push({u,z:re(t,s,n)});let g=a*c-r*l,_=a*l+r*c;C.push({words:{x:g,y:_},feed:0,rapid:!0,comment:`raster row y${_.toFixed(2)}`}),C.push({words:{z:S},feed:0,rapid:!0});let v=e.topZ-p[0].z;v>D&&(D=v),v>2&&O++,C.push({words:{z:p[0].z+br},feed:0,rapid:!0}),C.push({words:{z:p[0].z},feed:e.plungeFeed,comment:`plunge ${v.toFixed(2)}mm below surface`}),E+=Math.min(br,Math.max(0,e.topZ-p[0].z))/e.plungeFeed;let y=g,b=_,x=p[0].z;for(let t=1;t<p.length;t++){let n=p[t],i=n.u*c-r*l,a=n.u*l+r*c,o={x:i};Math.abs(a-b)>.005&&(o.y=a),Math.abs(n.z-x)>1e-9&&(o.z=n.z),C.push({words:o,feed:e.feed}),E+=Math.hypot(i-y,a-b,n.z-x)/e.feed,y=i,b=a,x=n.z}C.push({words:{z:S},feed:0,rapid:!0})}}}return O>0&&w.push(`deepest plunge ${D.toFixed(1)}mm below the crown — run a waterline contour first: this op assumes bulk stock is already cleared`),k>0&&w.push(`the model surface extends below the stock bottom — ${k} cell(s) finish flat there`),{moves:C,rows:T,estimatedMinutes:E,maxPlunge:D,warnings:w}}function Ps(e,t){let n=e*Math.PI/180,r=Math.cos(n),i=Math.sin(n);return e=>{let n=e.z-t;return new P(e.x,e.y*r-n*i,e.y*i+n*r+t)}}function Fs(e){return((Math.atan2(e.y,e.z)*180/Math.PI+90)%360+360)%360}function Is(e){if(!(e.x1>e.x0))throw Error(`empty stock span: x1 must exceed x0`);if(!(e.radius>0))throw Error(`bad stock radius: must be positive`);if(!(e.thetaStepOver>0))throw Error(`bad thetaStepOver: must be positive`);let t=e.thetaStepOver/2,n=e.x0,r=Math.floor((e.x1-e.x0)/t)+1,i=Math.max(24,Math.round(2*Math.PI*e.radius/e.thetaStepOver)),a=2*Math.PI/i,o=new Bt,s=Float32Array.from(e.positions);o.setAttribute(`position`,new At(s,3));let c=new $o(o,{targetLeafSize:1}),l=o.index;if(!l)throw Error(`three-mesh-bvh did not index the geometry`);let u=[],d=new Uint32Array(r*i).fill(4294967295),f=new Ie;for(let o=0;o<i;o++){let i=o*a,p=Math.sin(i),m=Math.cos(i);f.direction.set(0,-p,-m),f.origin.set(0,(e.radius+10)*p,e.axisZ+(e.radius+10)*m);for(let e=0;e<r;e++){f.origin.x=n+e*t;let a=c.raycastFirst(f,2);if(!a||a.faceIndex==null)continue;let p=l.getX(a.faceIndex*3)*3,m=l.getX(a.faceIndex*3+1)*3,h=l.getX(a.faceIndex*3+2)*3,g=s[m]-s[p],_=s[m+1]-s[p+1],v=s[m+2]-s[p+2],y=s[h]-s[p],b=s[h+1]-s[p+1],x=s[h+2]-s[p+2],S=_*x-v*b,C=v*y-g*x,w=g*b-_*y,T=Math.hypot(S,C,w);T<1e-12||(S/=T,C/=T,w/=T,S*f.direction.x+C*f.direction.y+w*f.direction.z>0&&(S=-S,C=-C,w=-w),d[o*r+e]=u.length,u.push({theta:i,p:{x:a.point.x,y:a.point.y,z:a.point.z},n:{x:S,y:C,z:w},align:Fs({x:S,y:C,z:w}),rake:S}))}}return o.dispose(),{cells:u,cellIndex:d,nx:r,nTheta:i,pitchX:t,gx0:n,surfaceCells:u.length}}function Ls(e,t,n,r,i){let a=n*Math.PI/180,o=Math.cos(a),s=Math.sin(a),c=e.z-i,l=e.x,u=e.y*o-c*s,d=e.y*s+c*o+i,f=Math.hypot(t.y,t.z);return{x:l+r*t.x,y:u-r*f,z:d}}function Rs(e){let t=e.tool.diameter/2,n=e.tool.fluteLength;if(!(t>0))throw Error(`bad tool: diameter must be positive`);if(n===void 0||!(n>0))throw Error(`bad tool: fluteLength must be positive`);if(!(e.radius>0))throw Error(`bad stock radius: must be positive`);let r=2*Math.PI*e.radius/e.map.nTheta,i=Math.max(.05,.25*Math.min(e.map.pitchX,r)),a=new Bt,o=Float32Array.from(e.positions);a.setAttribute(`position`,new At(o,3));let s=new $o(a,{targetLeafSize:1}),c=new P,l=new P,u=new P,d=new yn,f=new P,p=new P,m=new F,h=new Uint8Array(e.map.cells.length).fill(0);for(let r=0;r<e.map.cells.length;r++){let a=e.map.cells[r],o=a.align*Math.PI/180,g=Math.cos(o),_=Math.sin(o),v=a.p.z-e.axisZ;c.set(a.p.x,a.p.y*g-v*_,a.p.y*_+v*g+e.axisZ);let y=Math.hypot(a.n.y,a.n.z);if(y<1e-9){h[r]=1;continue}let b=c.x+t*a.n.x,x=c.y-t*y,S=c.z,C=Ps(-a.align,e.axisZ);l.copy(C({x:b,y:x,z:S-n})),u.copy(C({x:b,y:x,z:S+n})),d.start.copy(l),d.end.copy(u);let w=m;w.min.x=b-t,w.max.x=b+t,w.min.y=Math.min(l.y,u.y)-t,w.max.y=Math.max(l.y,u.y)+t,w.min.z=Math.min(l.z,u.z)-t,w.max.z=Math.max(l.z,u.z)+t;let T=!1;s.shapecast({intersectsBounds:e=>!(T||e.max.x<w.min.x||e.min.x>w.max.x||e.max.y<w.min.y||e.min.y>w.max.y||e.max.z<w.min.z||e.min.z>w.max.z),intersectsTriangle:e=>e.distanceToPoint(p.set(a.p.x,a.p.y,a.p.z))<i?!1:e.closestPointToSegment(d,f)<t-.001&&(T=!0,!0)}),T&&(h[r]=1)}return a.dispose(),h}function zs(e){let{cells:t,cellIndex:n,nx:r,nTheta:i}=e.map,a=t.length;if(e.verdict.length!==a)throw Error(`verdict/map mismatch: ${e.verdict.length} verdicts for ${a} cells`);let o=360/i,s=e.alignTolDeg??2*o;if(!(s>0))throw Error(`alignTolDeg must be positive`);let c=new Int32Array(a).fill(-1);for(let e=0;e<n.length;e++){let t=n[e];t!==4294967295&&(c[t]=e)}let l=e=>{let t=c[e];if(t<0)throw Error(`cell ${e} missing from the dense index`);let n=Math.floor(t/r);return{i:t-n*r,j:n}},u=(e,t)=>{if(e<0||e>=r)return-1;let a=(t%i+i)%i,o=n[a*r+e];return o===4294967295?-1:o},d=new Int32Array(a).map((e,t)=>t),f=e=>{let t=e;for(;d[t]!==t;)t=d[t];for(;d[e]!==t;){let n=d[e];d[e]=t,e=n}return t},p=(e,t)=>{let n=f(e),r=f(t);n!==r&&(d[n]=r)},m=0;for(let n=0;n<a;n++){if(e.verdict[n]!==0){m++;continue}let r=l(n);for(let[i,a]of Bs){let o=u(r.i+i,r.j+a);o<0||e.verdict[o]!==0||Vs(t[n].align,t[o].align)>s||p(n,o)}}let h=/* @__PURE__ */ new Map;for(let t=0;t<a;t++){if(e.verdict[t]!==0)continue;let n=f(t),r=h.get(n);r?r.push(t):h.set(n,[t])}let g=[];for(let e of h.values())for(let n of Hs(e,t,u,l,s))g.push({cells:n});return g.sort((e,t)=>e.cells[0]-t.cells[0]),{patches:g,unswarfableCells:m}}let Bs=[[1,0],[-1,0],[0,1],[0,-1]];function Vs(e,t){let n=Math.abs(e-t)%360;return n>180&&(n=360-n),n}function Hs(e,t,n,r,i){let a=new Set(e),o=/* @__PURE__ */ new Set,s=[];for(;o.size<e.length;){let c=-1;for(let n of e)o.has(n)||(c<0||t[n].align<t[c].align-1e-12)&&(c=n);if(c<0)break;let l=[c];o.add(c);let u=c;for(;;){let e=r(u),s=-1,c=1/0;for(let[r,l]of Bs){let d=n(e.i+r,e.j+l);if(d<0||o.has(d)||!a.has(d))continue;let f=((t[d].align-t[u].align)%360+360)%360;f>i+1e-9||f<c-1e-12&&(c=f,s=d)}if(s<0)break;o.add(s),l.push(s),u=s}s.push(l)}return s}function Us(e){let t=e.tool.diameter/2;if(!(t>0))throw Error(`bad tool: diameter must be positive`);if(!(e.radius>0))throw Error(`bad stock radius: must be positive`);let n=e.feed,r=e.plungeFeed??e.feed;if(!(n>0)||!(r>0))throw Error(`feeds must be positive`);let i=e.axisZ+e.radius+(e.safeClearance??5),{cells:a}=e.map,o=e.patch.cells,s=[];if(o.length===0)return{moves:s,estimatedMinutes:0,endA:e.startA??0};let c=e.startA??0,l=0,u=e.attitude===`ball`,d=e=>u?((a[e].align-90)%360+360)%360:a[e].align,f=n=>u?Gs(a[n].p,a[n].n,t,e.axisZ):Ls(a[n].p,a[n].n,a[n].align,t,e.axisZ),p=(t,n)=>{let r=n*Math.PI/180,i=Math.cos(r),o=Math.sin(r),s=a[t].p.z-e.axisZ;return{x:a[t].p.x,y:a[t].p.y*i-s*o,z:a[t].p.y*o+s*i+e.axisZ}},m=o[0],h=((d(m)-(c%360+360)%360)%360+360)%360;h>1e-9&&(c+=h,s.push({words:{a:c},feed:0,rapid:!0}));let g=f(m);s.push({words:{x:g.x,y:g.y},feed:0,rapid:!0}),s.push({words:{z:g.z},feed:r}),l+=Math.max(0,i-g.z)/r;let _=m,v=g,y=p(m,c);for(let e=1;e<o.length;e++){let t=o[e],r=((d(t)-d(_))%360+360)%360;c+=r;let i=f(t),a=p(t,c),u=Math.hypot(a.x-y.x,a.y-y.y,a.z-y.z),m=Math.hypot(i.x-v.x,i.y-v.y,i.z-v.z),h=Math.max(u/n,m/n,r/360/rr);s.push({words:{x:i.x,y:i.y,z:i.z,a:c},feed:1/h}),l+=h,_=t,v=i,y=a}return s.push({words:{z:i},feed:0,rapid:!0}),{moves:s,estimatedMinutes:l,endA:c}}function Ws(e){return((Fs(e)-90)%360+360)%360}function Gs(e,t,n,r){let i=Ws(t)*Math.PI/180,a=Math.cos(i),o=Math.sin(i),s=e.z-r,c=Math.hypot(t.y,t.z);return{x:e.x+n*t.x,y:e.y*a-s*o,z:e.y*o+s*a+r+n*c}}function Ks(e){let t=e.tool.diameter/2,n=e.tool.fluteLength;if(!(t>0))throw Error(`bad tool: diameter must be positive`);if(n===void 0||!(n>0))throw Error(`bad tool: fluteLength must be positive`);if(!(e.radius>0))throw Error(`bad stock radius: must be positive`);let r=e.glancingFloor??.3,i=Math.max(t,(e.tool.shaftDiameter??e.tool.diameter)/2);if(!(r>0)||!(r<1))throw Error(`bad glancing floor: 0 < floor < 1`);let a=2*Math.PI*e.radius/e.map.nTheta,o=Math.max(.05,.25*Math.min(e.map.pitchX,a)),s=new Bt,c=Float32Array.from(e.positions);s.setAttribute(`position`,new At(c,3));let l=new $o(s,{targetLeafSize:1}),u=new P,d=new P,f=new P,p=new yn,m=new P,h=new P,g=new F,_=new Uint8Array(e.map.cells.length).fill(0);for(let a=0;a<e.map.cells.length;a++){let s=e.map.cells[a];if(Math.hypot(s.n.y,s.n.z)<r){_[a]=1;continue}let c=Gs(s.p,s.n,t,e.axisZ),v=Ps(-Ws(s.n),e.axisZ);u.copy(v({x:c.x,y:c.y,z:c.z})),d.copy(v({x:c.x,y:c.y,z:c.z+t})),f.copy(v({x:c.x,y:c.y,z:c.z+n}));let y=!1;for(let[e,n,r]of[[u,d,t],[d,f,i]]){if(y)break;p.start.copy(e),p.end.copy(n),g.min.x=c.x-r,g.max.x=c.x+r,g.min.y=Math.min(e.y,n.y)-r,g.max.y=Math.max(e.y,n.y)+r,g.min.z=Math.min(e.z,n.z)-r,g.max.z=Math.max(e.z,n.z)+r,l.shapecast({intersectsBounds:e=>!(y||e.max.x<g.min.x||e.min.x>g.max.x||e.max.y<g.min.y||e.min.y>g.max.y||e.max.z<g.min.z||e.min.z>g.max.z),intersectsTriangle:e=>y?!0:e.distanceToPoint(h.set(s.p.x,s.p.y,s.p.z))<o?!1:e.closestPointToSegment(p,m)<r-.001&&(y=!0,!0)})}y&&(_[a]=1)}return s.dispose(),_}let qs=[{id:`aluminum-6061`,name:`Aluminum 6061`,feedByTool:{flat:420,bull:420,ball:500,vbit:600,drill:200,threadmill:200,corn:350,laser:100},stepDownByTool:{flat:.8,bull:.8,ball:.5,vbit:.4,drill:2,threadmill:.15,corn:.3,laser:.5},plungeFraction:.33},{id:`brass-360`,name:`Brass 360`,feedByTool:{flat:650,bull:650,ball:700,vbit:800,drill:300,threadmill:250,corn:500,laser:100},stepDownByTool:{flat:1.2,bull:1.2,ball:.8,vbit:.5,drill:3,threadmill:.2,corn:.4,laser:.5},plungeFraction:.3},{id:`delrin`,name:`Delrin (acetal)`,feedByTool:{flat:900,bull:900,ball:1e3,vbit:1e3,drill:350,threadmill:400,corn:700,laser:100},stepDownByTool:{flat:2,bull:2,ball:1.5,vbit:.8,drill:4,threadmill:.3,corn:.6,laser:.5},plungeFraction:.5},{id:`hardwood`,name:`Hardwood (maple/birch)`,feedByTool:{flat:1400,bull:1400,ball:1600,vbit:1600,drill:500,threadmill:500,corn:1e3,laser:100},stepDownByTool:{flat:2.5,bull:2.5,ball:1.8,vbit:1,drill:6,threadmill:.4,corn:.8,laser:.5},plungeFraction:.5},{id:`acrylic-cast`,name:`Acrylic (cast)`,feedByTool:{flat:800,bull:800,ball:900,vbit:900,drill:300,threadmill:300,corn:600,laser:100},stepDownByTool:{flat:1.2,bull:1.2,ball:.8,vbit:.5,drill:3,threadmill:.2,corn:.4,laser:.5},plungeFraction:.3}];function Js(e){let t=qs.find(t=>t.id===e);if(!t)throw Error(`unknown material id: ${e}`);return t}function Ys(e){let t=new le().setFromEuler(new qe(e.rotationDeg.x*Math.PI/180,e.rotationDeg.y*Math.PI/180,e.rotationDeg.z*Math.PI/180,`XYZ`)),n=new P(e.position.x,e.position.y,e.position.z);return r=>new P(r.x*e.scale.x,r.y*e.scale.y,r.z*e.scale.z).applyQuaternion(t).add(n)}let Xs=.985,Zs=.999,Qs=.985;function $s(e,t){return t(e).sub(t({x:0,y:0,z:0})).normalize().z}function ec(e,t){return t(e).sub(t({x:0,y:0,z:0})).normalize().x}function tc(e,t,n){let r=!1,i=!1,a=[];for(let n of e.circles)t.includes(n.id)&&a.push(new P(n.axis.x,n.axis.y,n.axis.z));for(let n of e.planes)t.includes(n.id)&&a.push(new P(n.normal.x,n.normal.y,n.normal.z));for(let e of a){let t=$s(e,n);if(Math.abs(t)>=Xs)t<=-.985&&(r=!0);else{if(Math.abs(ec(e,n))>=Qs)return`parallel`;Math.abs(t)<.5&&(i=!0)}}return r?`away`:i?`sideways`:null}function nc(e,t,n){let r=n(t.center),i=t,a=r.z;for(let o of e.circles){if(o.id===t.id||o.arcs)continue;let e=n(o.center);Math.abs(e.x-r.x)>ac||Math.abs(e.y-r.y)>ac||Math.abs(o.radius-t.radius)>oc||e.z>a&&(i=o,a=e.z)}return i}function rc(e,t,n,r,i=!1){let a=Ys(n),o=r?e=>r(a(e)):a,s=[],c=-1/0,l=!1,u=/* @__PURE__ */ new Set;for(let n of e.circles){if(!t.includes(n.id))continue;if(n.arcs){l=!0;continue}if(Math.abs($s(new P(n.axis.x,n.axis.y,n.axis.z),o))<Xs)continue;let r=nc(e,n,o);if(u.has(r.id))continue;u.add(r.id);let i=o(r.center),a=[];for(let e=0;e<64;e++){let t=e/64*Math.PI*2;a.push({x:i.x+Math.cos(t)*r.radius,y:i.y+Math.sin(t)*r.radius})}s.push(a),c=Math.max(c,i.z)}let d=[],f=-1/0;for(let n=0;n<e.planes.length;n++){let r=e.planes[n];if(!t.includes(r.id)||$s(new P(r.normal.x,r.normal.y,r.normal.z),o)<Xs)continue;let a=e.planeLoops.filter(e=>e.plane===n).map(e=>e.points.map(e=>{let t=o(e);return{x:t.x,y:t.y}}));if(a.length!==0){if(i){let e=a[0],t=-1/0;for(let n of a){let r=Math.abs(sc(n));r>t&&(t=r,e=n)}d.push(sc(e)>=0?e:[...e].reverse())}else d.push(...lc(a));f=Math.max(f,o(r.point).z)}}if(s.length>0&&d.length>0)throw Error(`select either faces or holes for this operation, not both`);if(d.length>0)return{regions:d,selectionZ:f};if(s.length>0)return{regions:s,selectionZ:c};if(l)throw Error(`a partial circle (a broken rim) cannot bound a pocket — select flat faces for the outline, or use its Ø in a facing operation`);if(t.length>0){let n=tc(e,t,o);throw Error(n===`parallel`?`a selected feature is parallel to the rotation axis — it can never face the cutter on this machine, however you index: there is no sensible interpretation`:n===`away`?`the selected face points away from the cutter at this datum — add an Index op to rotate it up if you want to machine this one`:n===`sideways`?`the selected face points sideways in the cutting frame — it is reachable by rotating the stock: add an Index op if you want to machine this one`:`the selected features cannot be pocketed in the cutting frame — they are not within ~10° of horizontal (a thread circle or side face may have snapped instead of the intended floor; zoom in and re-click, or check the datum angle)`)}return null}function ic(e,t,n,r,i){let a=Ys(n),o=i?e=>i(a(e)):a,s=[],c=/* @__PURE__ */ new Set;for(let n of e.circles){if(!n.inner||n.arcs||!t.includes(n.id)||Math.abs($s(new P(n.axis.x,n.axis.y,n.axis.z),o))<Zs)continue;let i=nc(e,n,o);if(c.has(i.id))continue;c.add(i.id);let a=o(i.center);s.push({x:a.x,y:a.y,topZ:a.z,depth:r})}return s.length>0?s:null}let ac=.05,oc=.02;function sc(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];t+=r.x*i.y-i.x*r.y}return t/2}function cc(e,t){let n=!1;for(let r=0,i=t.length-1;r<t.length;i=r++){let a=t[r],o=t[i];a.y>e.y!=o.y>e.y&&e.x<(o.x-a.x)*(e.y-a.y)/(o.y-a.y)+a.x&&(n=!n)}return n}function lc(e){let t=e.map(e=>({c:e,area:sc(e)})).sort((e,t)=>Math.abs(t.area)-Math.abs(e.area)),n=[];for(let{c:e,area:r}of t){let t=0;for(let r of n)cc(e[0],r)&&t++;let i=t%2==0;n.push(r>0===i?e:[...e].reverse())}return n}function uc(e,t,n,r){let i=Ys(n),a=r?e=>r(i(e)):i,o=[],s=/* @__PURE__ */ new Set;for(let n of e.circles){if(!t.includes(n.id))continue;if(n.arcs)throw Error(`a partial circle (a broken rim) cannot be chamfered — select a full circle, or a flat face to follow its outline`);if(Math.abs($s(new P(n.axis.x,n.axis.y,n.axis.z),a))<Xs)continue;let r=nc(e,n,a);if(s.has(r.id))continue;let i=a(r.center);o.push({kind:`circle`,center:{x:i.x,y:i.y},radius:r.radius,z:i.z,materialOutside:r.inner}),s.add(r.id)}let c=e.planeLoops;for(let n=0;n<e.planes.length;n++){let r=e.planes[n];if(!t.includes(r.id)||Math.abs($s(new P(r.normal.x,r.normal.y,r.normal.z),a))<Xs)continue;let i=c.filter(e=>e.plane===n).map(e=>e.points.map(e=>{let t=a(e);return{x:t.x,y:t.y}}));if(i.length===0)continue;let l=a(r.point).z,u=$s(new P(r.normal.x,r.normal.y,r.normal.z),a)<-.985,d=i.map(e=>Math.abs(sc(e))),f=Math.max(...d);for(let t=0;t<i.length;t++){let n=i[t],c=n.reduce((e,t)=>e+t.x,0)/n.length,p=n.reduce((e,t)=>e+t.y,0)/n.length,m=n.map(e=>Math.hypot(e.x-c,e.y-p)),h=m.reduce((e,t)=>e+t,0)/m.length,g=m.every(e=>Math.abs(e-h)<=oc)?e.circles.find(e=>{let t=a(e.center);return Math.abs(t.z-l)<=ac&&Math.hypot(t.x-c,t.y-p)<=ac&&Math.abs(e.radius-h)<=oc}):void 0;if(g){let t=nc(e,g,a);if(s.has(t.id))continue;let n=a(t.center);o.push({kind:`circle`,center:{x:n.x,y:n.y},radius:t.radius,z:n.z,materialOutside:t.inner})}else u||o.push({kind:`poly`,points:n,z:a(r.point).z,materialOutside:i.length!==1&&d[t]<f})}}if(o.length>0)return{loops:o};if(t.length>0){for(let n of e.circles){if(!t.includes(n.id))continue;let e=new P(n.axis.x,n.axis.y,n.axis.z);if(Math.abs(ec(e,a))>=Qs)throw Error(`a circle around the stock axis can never be chamfered in the cutting frame — its axis is the rotation axis, so indexing spins it in place. Use the Cylinder chamfer op for rod ends and step edges`)}let n=tc(e,t,a);throw Error(n===`parallel`?`a selected feature is parallel to the rotation axis — it can never face the cutter on this machine, however you index: there is no sensible interpretation`:n===`away`?`the selected face points away from the cutter at this datum — add an Index op to rotate it up if you want to machine this one`:n===`sideways`?`the selected edge points sideways in the cutting frame — it is reachable by rotating the stock: add an Index op if you want to machine this one`:`the selected features cannot be chamfered in the cutting frame — they are not within ~10° of horizontal (a side face or thread circle may have snapped instead of the intended edge; zoom in and re-click, or check the datum angle)`)}return null}function dc(e,t,n,r){let i=Ys(n),a=[],o=!1;for(let n of e.circles){if(!t.includes(n.id))continue;if(n.arcs)throw Error(`a partial circle (a broken rim) cannot be chamfered — select a full circle around the stock axis`);if(Math.abs(ec(new P(n.axis.x,n.axis.y,n.axis.z),i))<Qs)continue;let e=i(n.center);Math.hypot(e.y,e.z-r.axisZ)>.2?o=!0:a.push({x:e.x,diameter:n.radius*2})}if(a.length>0)return{edges:a};if(o)throw Error(`the selected circle runs around X but sits off the stock axis — an A sweep would trace an ellipse, not the circle (the primitive must sit on the rotation axis)`);if(t.length>0)throw Error(`the selected features hold no circle around the stock axis — cylinder chamfer cuts a full 360° ring, so it needs an edge circle coaxial with the rotation axis (face-op step edges and stock end rims show as green circles; zoom in and re-click)`);return null}function fc(e,t,n,r){let i=Ys(n),a=r?e=>r(i(e)):i,o=[],s=/* @__PURE__ */ new Set,c=!1,l=t=>{let n=nc(e,t,a);if(s.has(n.id))return!1;s.add(n.id);let r=a(n.center);return o.push({center:{x:r.x,y:r.y},internal:n.inner,rimZ:r.z,radius:n.radius}),!0};for(let n of e.circles){if(!t.includes(n.id))continue;if(n.arcs){c=!0;continue}let e=new P(n.axis.x,n.axis.y,n.axis.z);Math.abs($s(e,a))<Zs||l(n)}for(let n=0;n<e.planes.length;n++){let r=e.planes[n];if(!t.includes(r.id))continue;let i=new P(r.normal.x,r.normal.y,r.normal.z),s=$s(i,a),c=a(r.point);if(Math.abs(s)>=Xs){let t=e.planeLoops.filter(e=>e.plane===n).map(e=>e.points.map(e=>{let t=a(e);return{x:t.x,y:t.y}}));for(let n of t){let t=n.reduce((e,t)=>e+t.x,0)/n.length,r=n.reduce((e,t)=>e+t.y,0)/n.length,i=n.map(e=>Math.hypot(e.x-t,e.y-r)),o=i.reduce((e,t)=>e+t,0)/i.length;if(!i.every(e=>Math.abs(e-o)<=oc))continue;let s=e.circles.find(e=>{if(e.arcs||Math.abs($s(new P(e.axis.x,e.axis.y,e.axis.z),a))<Zs)return!1;let n=a(e.center);return Math.abs(n.z-c.z)<=ac&&Math.hypot(n.x-t,n.y-r)<=ac&&Math.abs(e.radius-o)<=oc});s&&l(s)}continue}let u=a({x:c.x+i.x,y:c.y+i.y,z:c.z+i.z}).clone().sub(c).normalize(),d=null;for(let t of e.circles){if(t.arcs||Math.abs($s(new P(t.axis.x,t.axis.y,t.axis.z),a))<Zs)continue;let e=a(t.center),n=Math.abs(e.clone().sub(c).dot(u)),r=Math.max(.1,t.radius*.06),i=Math.abs(n-t.radius);i<=r&&(!d||i<d.err)&&(d={c:t,err:i})}if(d){let t=l(d.c)?o[o.length-1]:o.find(e=>e.radius===d.c.radius);if(t){let r=-1/0,i=1/0;for(let t of e.planeLoops)if(t.plane===n)for(let e of t.points){let t=a(e).z;t>r&&(r=t),t<i&&(i=t)}Number.isFinite(r)&&(t.spanZ=[r,i])}}}if(o.length>0){let e=o[0].radius,t=o[0].internal;if(o.some(t=>Math.abs(t.radius-e)>oc))throw Error(`the selection mixes diameters — one thread op cuts one thread size; add a second Thread mill op for the other`);if(o.some(e=>e.internal!==t))throw Error(`the selection mixes bores and bosses — a thread op cuts either internal or external threads, not both; split them into two ops`);return{targets:o}}if(c)throw Error(`a partial circle (a broken rim) is not a threadable bore — select a complete circle, the cylinder wall, or the flat face around it`);if(t.length>0){for(let n of e.circles)if(t.includes(n.id)&&Math.abs(ec(new P(n.axis.x,n.axis.y,n.axis.z),a))>=Qs)throw Error(`a circle around the stock axis is the 4-axis Thread op's job — a 3-axis thread mill cuts vertical bores and bosses; use the rotary V-bit thread for the stock axis`);let n=tc(e,t,a);throw Error(n===`parallel`?`a selected feature is parallel to the rotation axis — it can never face the cutter on this machine, however you index: there is no sensible interpretation`:n===`away`?`the selected face points away from the cutter at this datum — add an Index op to rotate it up if you want to machine this one`:n===`sideways`?`the selected wall is not vertical in the cutting frame — a thread helix only cuts vertical bores and bosses; add an Index op if the feature is reachable by rotating the stock`:`the selected features hold no vertical bore or boss to thread — pick the rim circle, the cylinder wall, or the flat face around it (and check the datum angle)`)}return null}function pc(e){return e.kind===`cylinder`?e.axisMode===`3-axis`?zn(e.xOrigin,e.length)[1]:e.calibration.axisZ+e.calibration.effectiveRadius:zn(e.origin.z,e.sizeZ)[1]}function mc(e,t){if(e.kind===`cylinder`){let n=e.calibration.effectiveRadius;if(e.axisMode===`3-axis`)switch(t){case`x`:case`y`:return[-n,n];case`z`:return zn(e.xOrigin,e.length)}switch(t){case`x`:return zn(e.xOrigin,e.length);case`y`:return[-n,n];case`z`:return[e.calibration.axisZ-n,e.calibration.axisZ+n]}}switch(t){case`x`:return zn(e.origin.x,e.sizeX);case`y`:return zn(e.origin.y,e.sizeY);case`z`:return zn(e.origin.z,e.sizeZ)}}function hc(e,t=!1){if(e.kind===`box`){let[n,r]=mc(e,`x`),i,a;if(t){let t=Math.hypot(e.sizeY,e.sizeZ)/2;i=-t,a=t}else[i,a]=mc(e,`y`);return[[{x:n,y:i},{x:r,y:i},{x:r,y:a},{x:n,y:a}]]}let n=e.calibration.effectiveRadius;if(e.axisMode===`3-axis`){let e=[];for(let t=0;t<64;t++){let r=t/64*Math.PI*2;e.push({x:n*Math.cos(r),y:n*Math.sin(r)})}return[e]}let[r,i]=mc(e,`x`);return[[{x:r,y:-n},{x:i,y:-n},{x:i,y:n},{x:r,y:n}]]}let $=e=>({moves:[],minutes:0,error:e,summary:null});function gc(e,t,n,r,i,a,o,s,c){let l=e.kind===`profile`?e.sideAllowance:e.allowance,u=l>0?Fr(n,l):n,d=Rr(hc(s.stock,c),u);if(d.length===0)return null;try{let n=si({kind:`pocket`,id:e.id,toolId:t.id,regions:d,topZ:r.topZ,floorZ:r.floorZ,stepDown:e.stepDown,stepOver:i,feed:a,plungeFeed:o,safeClearance:e.rates?.clearance??5,finishingOnly:e.finishingOnly},t);return n.moves.length===0?null:{moves:n.moves,minutes:n.estimatedMinutes,passes:n.passes}}catch{return null}}function _c(e,t,n,r,i,a){return`${n} passes around the section ${e.sliceDepth.toFixed(1)} below the crown (${a}), z${t.topZ.toFixed(1)} → z${t.floorZ.toFixed(1)}`+(e.allowance>0?`, ${e.allowance}mm allowance`:``)+`, ~${r.toFixed(1)} min`+(i>0?` · ${i} open chain(s) dropped — slice incomplete`:``)}function vc(e,t){if(e===0)return{};if(t.axisMode!==`4-axis`)throw Error(`indexing needs 4-axis mode — the job has an index datum without it`);return{rotate:Ps(e,Bn(t).axisZ)}}let yc={"aluminum-6061":`aluminum`,"brass-360":`brass`,delrin:`plastic`,hardwood:`hardwood`,"acrylic-cast":`plastic`};function bc(e,t){let n=yc[t]??t.split(`-`)[0].toLowerCase();return e.presets?.find(e=>e.material.toLowerCase().includes(n))??null}function xc(e,t,n){let r=bc(e,t.id);return{feed:n?.feed??r?.feed??t.feedByTool[e.type],plungeFeed:n?.plungeFeed??r?.plungeFeed??Math.round(t.feedByTool[e.type]*t.plungeFraction)}}function Sc(e,t,n){if(n?.spindleRpm!==void 0)return n.spindleRpm;if(e)return bc(e,t)?.spindleRpm??e.spindleRpm}let Cc={x:1200,y:1200,z:600},wc=1.1;function Tc(e,t,n,r){let i=0,a,o,s,c=t;for(let t of e){let e=t.words;if(t.rapid){let t=0;e.x!==void 0&&a!==void 0&&(t=Math.max(t,Math.abs(e.x-a)/Cc.x)),e.y!==void 0&&o!==void 0&&(t=Math.max(t,Math.abs(e.y-o)/Cc.y)),e.z!==void 0&&s!==void 0&&(t=Math.max(t,Math.abs(e.z-s)/Cc.z)),e.a!==void 0&&(t=Math.max(t,Math.abs(e.a-c)/3600)),i+=t}e.x!==void 0&&(a=e.x),e.y!==void 0&&(o=e.y),e.z!==void 0&&(s=e.z),e.a!==void 0&&(c=e.a)}let l=r===void 0?0:Math.abs(r-(n??0))/1800/60;return i+l}function Ec(e){return Math.max(.1,Math.round(e.diameter*.5*10)/10)}function Dc(e){return Math.max(.1,Math.round(.5*e.diameter*10)/10)}function Oc(e,t,n,r){if(!Number.isFinite(e)||!Number.isFinite(t)||!Number.isFinite(n)||t<e-1e-9)return null;let i=r-e,a=r-t+n;return a>i+1e-9?null:{topZ:i,floorZ:a}}function kc(e,t,n){return t.length===0?{parts:[],error:n}:e.length===0?{parts:[],error:`add a primitive or load a model first`}:tr(e,t).length>0?{parts:[],error:`the selected features no longer exist — the primitive was resized or deleted; reselect`}:{parts:er(e,t),error:null}}function Ac(e,t){if(Vn(e)&&e.floorFeatureId!==null&&!$n(t.sources,e.floorFeatureId))return{...$(`the floor feature no longer exists — reselect`),finalA:t.startA};let n=jc(e,t),r=t.startA;for(let e=n.moves.length-1;e>=0;e--){let t=n.moves[e].words.a;if(t!==void 0){r=t;break}}let i=t.startA,a=r!==t.startA;if(e.kind!==`index`&&n.moves.length>0&&a){let e=i-r;Math.abs(e%360)>1e-9&&(n.moves.push({words:{a:i},feed:0,rapid:!0,comment:`return A to the borrowed datum ${i.toFixed(1)}° (datum discipline)`}),r=i)}e.kind===`index`&&(i=r);let o={...n,finalA:i};if(e.kind===`index`||o.moves.length===0)return o;let s=t.tools.find(t=>t.id===e.toolId);if(s?.type===`laser`)return{...o,minutes:o.minutes*wc+Tc(o.moves,t.startA,void 0,void 0)};let c=Sc(s,t.stock.materialId,e.rates);return c===void 0?{...o,minutes:o.minutes*wc+Tc(o.moves,t.startA,t.prevRpm,void 0)}:{...o,spindleRpm:c,moves:[{...o.moves[0],spindleRpm:c},...o.moves.slice(1)],minutes:o.minutes*wc+Tc(o.moves,t.startA,t.prevRpm,c)}}function jc(e,t){try{let n=t.tools.find(t=>t.id===e.toolId);if(!n)return $(`tool missing from library`);if(n.type===`laser`&&e.kind!==`engrave`)return $(`the laser only fits the engrave operation — pick a cutting tool for this op`);let r=Js(t.stock.materialId),{feed:i,plungeFeed:a}=xc(n,r,e.rates);switch(e.kind){case`index`:return t.stock.axisMode===`4-axis`?{moves:[{words:{a:t.startA+ar(e.angle,t.startA)},feed:0,rapid:!0,comment:`index stock to A${e.angle}° — datum for following ops`}],minutes:0,error:null,summary:`index A${e.angle}° (datum for the ops below)`}:$(`indexing needs 4-axis mode (Stock tab)`);case`faceCylinder`:{if(t.stock.axisMode!==`4-axis`)return $(`face cylinder needs 4-axis mode (Stock tab)`);let r=sr({kind:`faceCylinder`,id:e.id,toolId:n.id,targetDiameter:e.targetDiameter,xStart:e.xStart,xEnd:e.xEnd,stepDown:e.stepDown,finishingOnly:e.finishingOnly,stepOver:e.stepOver??Dc(n),finishAllowance:e.finishAllowance,plungeFeed:a,feed:i,rotation:e.rotation,pattern:e.pattern,clearance:e.rates?.clearance,cutBeyondStock:e.cutBeyondStock},Bn(t.stock),n,t.startA);return{moves:r.moves,minutes:r.estimatedMinutes,error:null,summary:`${r.passes} passes (${e.pattern}) → Ø${e.targetDiameter.toFixed(1)}mm, X ${e.xStart.toFixed(0)}…${e.xEnd.toFixed(0)}`+(e.finishingOnly?`, finishing pass only`:``)+(e.cutBeyondStock?`, tail stock cut-over`:`, squared edges`)+`, ~${r.estimatedMinutes.toFixed(1)} min`}}case`spiralCarve`:if(t.stock.axisMode!==`4-axis`)return $(`spiral carving needs 4-axis mode (Stock tab)`);try{let r=gr({kind:`spiralCarve`,id:e.id,toolId:n.id,surfaceDiameter:e.surfaceDiameter,xStart:e.xStart,xEnd:e.xEnd,spiralAngle:e.spiralAngle,count:e.count,depth:e.depth,width:e.width,stepDown:e.finishingOnly?e.depth:e.stepDown,rotation:e.rotation,spin:e.spin,feed:i,plungeFeed:a,clearance:e.rates?.clearance},Bn(t.stock),n.diameter,t.datumAngle,t.startA);return{moves:r.moves,minutes:r.estimatedMinutes,error:null,summary:`${e.count} strand(s) × ${r.passes/e.count} sweep(s), ${e.spiralAngle}° helix, ${e.depth}mm deep × ${e.width===0?`following the lines`:`${e.width}mm wide`}`+(e.finishingOnly?`, finishing pass only`:``)+`, X ${e.xStart.toFixed(0)}…${e.xEnd.toFixed(0)}, ~${r.estimatedMinutes.toFixed(1)} min`}}catch(e){return $(e instanceof Error?e.message:String(e))}case`thread`:if(t.stock.axisMode!==`4-axis`)return $(`threading needs 4-axis mode (Stock tab)`);try{let r=e.finishingOnly&&n.vAngle?(()=>{let r=Bn(t.stock),i=_r(e.pitch,n.vAngle,e.tolerance),a=vr(e.nominalDiameter,e.tolerance)/2-i;return(e.surfaceDiameter===null?r.effectiveRadius:e.surfaceDiameter/2)-a})():NaN,o=yr({kind:`thread`,id:e.id,toolId:n.id,nominalDiameter:e.nominalDiameter,xStart:e.xStart,xEnd:e.xEnd,pitch:e.pitch,starts:e.starts,tolerance:e.tolerance,stepDown:r>0?r:e.stepDown,rotation:e.rotation,feed:i,plungeFeed:a,surfaceDiameter:e.surfaceDiameter,clearance:e.rates?.clearance},Bn(t.stock),n,t.datumAngle,t.startA);return{moves:o.moves,minutes:o.estimatedMinutes,error:null,summary:`Ø${e.nominalDiameter} × ${e.pitch}mm pitch`+(e.starts>1?` (${e.starts} starts)`:``)+`, crest Ø${o.faceDiameter.toFixed(2)}, ${o.depth.toFixed(2)}mm grooves, ${o.passes} sweep(s) + spring`+(e.finishingOnly?`, finishing pass only`:``)+`, X ${e.xStart.toFixed(0)}…${e.xEnd.toFixed(0)}, ~${o.estimatedMinutes.toFixed(1)} min`}}catch(e){return $(e instanceof Error?e.message:String(e))}case`pocket`:{let r=`select features (circles or flat faces)`,{parts:o,error:s}=kc(t.sources,e.featureIds,r);if(s)return $(s);let{rotate:c}=vc(t.datumAngle,t.stock),l=[],u=!1,d=!1;for(let t of o){let n=t.ids.every(e=>t.source.features.circles.some(t=>t.id===e)),r=t.ids.every(e=>t.source.features.planes.some(t=>t.id===e)),i=rc(t.source.features,t.ids,t.source.transform,c,e.flatten);i&&i.regions.length!==0&&(n&&(u=!0),r&&(d=!0),l.push(...i.regions))}if(u&&d)return $(`select either faces or holes for this operation, not both`);if(l.length===0)return $(r);let f=pc(t.stock),p=Oc(e.startDepth,e.endDepth,e.allowance,f);if(!p)return $(`end depth must be at or below start depth, and the allowance must leave something to cut`);let m=e.allowance>0?Pr(l,e.allowance):l;if(m.length===0)return $(`the side allowance exceeds the selected region — nothing left to cut`);e.cutBeyondStock!==!1&&(m=Fr(m,e.stepOver));let h=e.finishingOnly?Math.max(p.topZ-p.floorZ+1e-6,.1):e.stepDown,g=si({kind:`pocket`,id:e.id,toolId:n.id,regions:m,topZ:p.topZ,floorZ:p.floorZ,stepDown:h,stepOver:e.stepOver,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5,finishingOnly:e.finishingOnly,footprint:e.cutBeyondStock===!1?hc(t.stock,t.datumAngle!==0):Fr(hc(t.stock,t.datumAngle!==0),e.stepOver)},n);return{moves:g.moves,minutes:g.estimatedMinutes,error:null,summary:`${g.passes} passes / ${g.levels} level(s), z${p.topZ.toFixed(1)} → z${p.floorZ.toFixed(1)}`+(e.allowance>0?`, ${e.allowance}mm allowance`:``)+(g.continuous>0?`, continuous descent`:``)+(g.links>0?`, ${g.links} stay-down link(s)`:``)+(e.finishingOnly?`, finishing pass only`:``)+(e.cutBeyondStock?`, step-over past the edge`:``)+`, ~${g.estimatedMinutes.toFixed(1)} min`}}case`slicePocket`:{if(!t.geometry)return $(`needs a loaded model — the slice comes from it`);let r=pc(t.stock),o=Oc(e.startDepth,e.endDepth,e.allowance,r);if(!o)return $(`end depth must be at or below start depth, and the allowance must leave something to cut`);let{rotate:s}=vc(t.datumAngle,t.stock),c=ms(t.geometry,t.transform),l=Ss(s?(()=>{let e=new Float32Array(c.length);for(let t=0;t<c.length;t+=3){let n=s({x:c[t],y:c[t+1],z:c[t+2]});e[t]=n.x,e[t+1]=n.y,e[t+2]=n.z}return e})():c,r-e.sliceDepth);if(l.contours.length===0)return $(`the section plane at this slice depth is empty — move it (the viewport handle or the Slice depth box) to where the model has a clean body`);let u=l.droppedChains,d=e.finishingOnly?Math.max(o.topZ-o.floorZ+1e-6,.1):e.stepDown;if(e.regionMode===`inside`){let t=e.allowance>0?Pr(l.contours,e.allowance):l.contours;if(t.length===0)return $(`the side allowance exceeds the section — nothing left to clear`);let r=si({kind:`pocket`,id:e.id,toolId:n.id,regions:t,topZ:o.topZ,floorZ:o.floorZ,stepDown:d,stepOver:e.stepOver,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5,finishingOnly:e.finishingOnly},n);return{moves:r.moves,minutes:r.estimatedMinutes,error:null,summary:_c(e,o,r.passes,r.estimatedMinutes,u,`pocket`)+(e.finishingOnly?` · finishing pass only`:``)}}let f=di({kind:`profile`,id:e.id,toolId:n.id,contours:l.contours,side:`outside`,sideAllowance:e.allowance,bottomAllowance:0,topZ:o.topZ,floorZ:o.floorZ,stepDown:d,tabs:e.tabs??void 0,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5,finishingOnly:e.finishingOnly},n),p=f.moves,m=f.estimatedMinutes,h=f.passes,g=``;if(e.clearToStock){let r=gc(e.finishingOnly?{...e,stepDown:d}:e,n,l.contours,o,e.stepOver,i,a,t,t.datumAngle!==0);r?(p=p.concat(r.moves),m+=r.minutes,h+=r.passes,g=`, waste cleared to the stock edge`):g=` · frame thinner than the tool — waste left standing`}return{moves:p,minutes:m,error:null,summary:_c(e,o,h,m,u,`profile`)+(e.finishingOnly?` · finishing pass only`:``)+g+(f.warnings.length>0?` · ${f.warnings.join(` · `)}`:``)}}case`waterline`:{if(!t.geometry)return $(`needs a loaded model — the rough targets it`);let r=pc(t.stock),o=mc(t.stock,`z`)[0],{rotate:s}=vc(t.datumAngle,t.stock),c=ms(t.geometry,t.transform),l=s?(()=>{let e=new Float32Array(c.length);for(let t=0;t<c.length;t+=3){let n=s({x:c[t],y:c[t+1],z:c[t+2]});e[t]=n.x,e[t+1]=n.y,e[t+2]=n.z}return e})():c,u=1/0,d=-1/0;for(let e=2;e<l.length;e+=3)l[e]<u&&(u=l[e]),l[e]>d&&(d=l[e]);let f=Math.max(u,o),p=[];u<o-1e-9&&p.push(`model extends ${(o-u).toFixed(1)}mm below the stock bottom — roughing stops at the bottom`),d>r+1e-9&&p.push(`model rises ${(d-r).toFixed(1)}mm above the stock crown — the excess is left as-is`);let m=ks({positions:l,footprint:e.clearToStock||!e.cutBeyondStock?hc(t.stock,t.datumAngle!==0):void 0,topZ:r,floorZ:f,stepDown:e.stepDown,stepOver:e.stepOver,allowance:e.allowance,finishingOnly:e.finishingOnly,clearToStock:e.clearToStock,maxDepth:e.maxDepth??void 0,margin:e.margin??n.diameter+e.allowance+e.stepOver,tool:n,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5});if(m.moves.length===0)return $(`nothing to rough — the model already fills the stock footprint down to its floor`);let h=m.levels[m.levels.length-1],g=[...p,...m.warnings];return m.droppedChains>0&&g.push(`${m.droppedChains} open chain(s) dropped — broken mesh, some levels incomplete`),{moves:m.moves,minutes:m.estimatedMinutes,error:null,summary:`${m.levels.length} waterline level(s), ${m.passes} passes, z${r.toFixed(1)} → z${h.toFixed(1)}`+(m.skippedLevels>0?`, ${m.skippedLevels} level(s) skipped`:``)+(e.allowance>0?`, ${e.allowance}mm allowance`:``)+(e.clearToStock?`, excess cleared to the stock edge`:``)+(e.maxDepth&&e.maxDepth>0?`, ${e.maxDepth}mm max depth`:``)+(e.finishingOnly?`, finishing pass only (surface scrub, waste cleared at the floor level)`:``)+`, ~${m.estimatedMinutes.toFixed(1)} min`+(g.length>0?` · ${g.join(` · `)}`:``)}}case`contour4d`:{if(!t.geometry)return $(`needs a loaded model — the plan targets it`);if(t.stock.axisMode!==`4-axis`)return $(`the 4D contour needs 4-axis stock — it rotates the part between roughing angles`);if(!(e.orientStep>0)||e.orientStep>=360)return $(`orientation step must be between 0° and 360°`);let r=Bn(t.stock),[o,s]=mc(t.stock,`x`),c=ms(t.geometry,t.transform),l=[];for(let t=0;t<360;t+=e.orientStep)l.push(t);let u=as({positions:c,x0:o,x1:s,radius:r.effectiveRadius,axisZ:r.axisZ,thetaStepOver:e.stepOver,tool:{diameter:n.diameter},orientations:l}),d=os(u),f=d.picks.map(e=>`${e.angle}°`),p=u.coverable>0?100*d.covered/u.coverable:100,m=ds(t.standing,{x0:o,x1:s,radius:r.effectiveRadius,axisZ:r.axisZ,thetaStepOver:e.stepOver,datumAngle:t.datumAngle}),h=pc(t.stock),g=mc(t.stock,`z`)[0],_=[],v=0,y=0,b=0,x=0,S=/* @__PURE__ */ new Map,C=(e,t)=>{let n=t.replace(/-?\d+(?:\.\d+)?/g,`#`);if(e.has(n))return;e.add(n);let r=S.get(n);r?r.orientations++:S.set(n,{example:t,orientations:1})},w=t.startA;for(let[r,o]of d.picks.entries()){let s=/* @__PURE__ */ new Set,{rotate:l}=vc(o.angle,t.stock),u=l?(()=>{let e=new Float32Array(c.length);for(let t=0;t<c.length;t+=3){let n=l({x:c[t],y:c[t+1],z:c[t+2]});e[t]=n.x,e[t+1]=n.y,e[t+2]=n.z}return e})():c,f=1/0;for(let e=2;e<u.length;e+=3)u[e]<f&&(f=u[e]);let p=ks({positions:u,standing:(()=>{let e=fs(m,o.angle+t.datumAngle,n.diameter);return{trimBand:e.trimBand,stampBand:e.stampBand,computeCeiling:e.computeCeiling,sweptClear:e.sweptClear,segmentClear:e.segmentClear}})(),footprint:e.clearToStock||!e.cutBeyondStock?hc(t.stock,o.angle%360!=0):void 0,topZ:h,floorZ:Math.max(f,g),stepDown:e.stepDown,stepOver:e.stepOver,allowance:e.allowance,finishingOnly:e.finishingOnly,clearToStock:e.clearToStock,maxDepth:e.maxDepth??void 0,margin:e.margin??n.diameter+e.allowance+e.stepOver,tool:n,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5});if(p.moves.length===0){C(s,`orientation ${o.angle}°: nothing to rough`);continue}let S=w+ar(o.angle,w);Math.abs(S-w)>1e-9&&(_.push({words:{a:S},feed:0,rapid:!0,comment:`orientation ${r+1}/${d.picks.length}: index stock to A${o.angle}°`}),w=S);for(let e of p.moves)_.push(e);v+=p.estimatedMinutes,y++,b+=p.levels.length,p.standingSkips>0&&(x+=p.standingSkips,C(s,`${p.standingSkips} level(s) pruned — no standing material left in the band`));for(let e of p.warnings)C(s,e);p.droppedChains>0&&C(s,`${p.droppedChains} open chain(s) dropped — broken mesh, some levels incomplete`)}{let t=ps({grid:m,positions:c,allowance:e.allowance,thinBelow:Math.max(.2,e.stepOver),toolDiameter:n.diameter});if(t.note){let e=`thin-streamer`;S.has(e)||S.set(e,{example:t.note,orientations:1})}}if(y===0)return $(`nothing to rough — every chosen orientation already sits at the model surface`);let T=[...S.values()].map(({example:e,orientations:t})=>t>1?t===y?`${e} (all ${y} orientations)`:`${e} (at ${t} of ${y} orientations)`:e);return{moves:_,minutes:v,error:null,standing:m,summary:`plan: ${d.picks.length} orientation(s) [${f.join(`, `)}] · ${d.covered}/${u.coverable} coverable cells (${p.toFixed(0)}%) · ${u.buriedEverywhere} unreachable (deep undercuts) · ${y} rough(s) emitted, ${b} level(s)`+(x>0?`, ${x} pruned by the standing map`:``)+`, ~${v.toFixed(1)} min`+(T.length>0?` · ${T.join(` · `)}`:``)}}case`rasterContour`:{if(!t.geometry)return $(`needs a loaded model — the surface pass targets it`);let r=pc(t.stock),o=mc(t.stock,`z`)[0],{rotate:s}=vc(t.datumAngle,t.stock),c=ms(t.geometry,t.transform),l=s?(()=>{let e=new Float32Array(c.length);for(let t=0;t<c.length;t+=3){let n=s({x:c[t],y:c[t+1],z:c[t+2]});e[t]=n.x,e[t+1]=n.y,e[t+2]=n.z}return e})():c,u=1/0;for(let e=2;e<l.length;e+=3)l[e]<u&&(u=l[e]);let d=Ns({positions:l,pitch:e.stepOver/2,stepOver:e.stepOver,allowance:e.allowance,angleDeg:e.angle??0,stepDown:e.finishingOnly?void 0:e.stepDown&&e.stepDown>0?e.stepDown:void 0,topZ:r,bottomZ:o,clearToStock:e.clearToStock,footprint:e.clearToStock?hc(t.stock,t.datumAngle!==0):void 0,clearFloorZ:Number.isFinite(u)?Math.max(u,o):o,cutBeyondStock:e.cutBeyondStock,tool:n,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5}),f=e.angle??0;if(d.moves.length===0)return $(`nothing to surface — the model top already sits at the stock crown`);let p=[...d.warnings];return{moves:d.moves,minutes:d.estimatedMinutes,error:null,summary:`${d.rows} raster row(s) at ${e.stepOver}mm step over`+(f===0?``:`, rows at ${f}°`)+(e.finishingOnly?`, finishing pass only`:(e.stepDown??0)>0?`, ${e.stepDown}mm step down`:``)+(e.allowance>0?`, ${e.allowance}mm allowance`:`, to size`)+(e.clearToStock?`, excess cleared to the stock edge`:``)+(e.cutBeyondStock?`, tail stock cut-over`:``)+`, ~${d.estimatedMinutes.toFixed(1)} min`+(p.length>0?` · ${p.join(` · `)}`:``)}}case`rotaryCarve`:{if(!t.geometry)return $(`needs a loaded model — the carve targets it`);if(t.stock.kind!==`cylinder`)return $(`rotary contour needs cylinder stock (Stock tab)`);if(t.stock.axisMode!==`4-axis`)return $(`rotary contour needs 4-axis mode (Stock tab)`);let r=Bn(t.stock),[o,s]=mc(t.stock,`x`),{rotate:c}=vc(t.datumAngle,t.stock),l=ms(t.geometry,t.transform),u=c?(()=>{let e=new Float32Array(l.length);for(let t=0;t<l.length;t+=3){let n=c({x:l[t],y:l[t+1],z:l[t+2]});e[t]=n.x,e[t+1]=n.y,e[t+2]=n.z}return e})():l,d=0;for(let e=0;e<u.length;e+=3){let t=Math.hypot(u[e+1],u[e+2]-r.axisZ);t>d&&(d=t)}let f=is({positions:u,x0:o,x1:s,radius:r.effectiveRadius,axisZ:r.axisZ,tool:n,stepDown:e.stepDown,stepOver:e.stepOver,allowance:e.allowance,finishingOnly:e.finishingOnly,strategy:e.strategy,datumAngle:t.datumAngle,startA:t.startA,standing:t.standing,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5});if(f.moves.length===0)return $(`nothing to carve — the model already sits at the stock surface`);let p=[...f.warnings];d>r.effectiveRadius+1e-6&&p.push(`the model extends ${(d-r.effectiveRadius).toFixed(1)}mm above the stock radius — that part cannot be cut`);let m=e.strategy===`vertical`?`, vertical rings`:e.strategy===`spiralWrap`?`, spiral wrap`:``;return{moves:f.moves,minutes:f.estimatedMinutes,error:null,standing:f.standing,summary:(e.finishingOnly?`finishing pass only`:`${f.stats.levels} rough level(s), `)+`${f.stats.wraps} wrap(s)`+m+(e.allowance>0?`, ${e.allowance}mm allowance`:``)+`, ~${f.estimatedMinutes.toFixed(1)} min`+(p.length>0?` · ${p.join(` · `)}`:``)}}case`swarfFinish`:{if(!t.geometry)return $(`needs a loaded model — the finish hugs it`);if(t.stock.kind!==`cylinder`)return $(`the 4D finish needs cylinder stock (Stock tab)`);if(t.stock.axisMode!==`4-axis`)return $(`the 4D finish needs 4-axis mode (Stock tab)`);if(n.type!==`flat`&&n.type!==`corn`&&n.type!==`ball`)return $(`the V-flank kernel is last in the build order — a ${n.type} tool cannot run the 4D finish yet`);let r=n.type===`ball`,o=r?`ball`:`flank`,s=Bn(t.stock),[c,l]=mc(t.stock,`x`),{rotate:u}=vc(t.datumAngle,t.stock),d=ms(t.geometry,t.transform),f=u?(()=>{let e=new Float32Array(d.length);for(let t=0;t<d.length;t+=3){let n=u({x:d[t],y:d[t+1],z:d[t+2]});e[t]=n.x,e[t+1]=n.y,e[t+2]=n.z}return e})():d,p=Is({positions:f,x0:c,x1:l,radius:s.effectiveRadius,axisZ:s.axisZ,thetaStepOver:e.stepOver});if(p.surfaceCells===0)return $(`no surface in the stock span — nothing to finish`);let{patches:m,unswarfableCells:h}=zs({map:p,verdict:r?Ks({positions:f,tool:n,map:p,axisZ:s.axisZ,radius:s.effectiveRadius,glancingFloor:e.glancingFloor}):Rs({positions:f,tool:n,map:p,axisZ:s.axisZ,radius:s.effectiveRadius})}),g=[],_=0,v=t.startA,y=0;for(let t of m){let o=Us({map:p,patch:t,tool:n,axisZ:s.axisZ,radius:s.effectiveRadius,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5,startA:v,attitude:r?`ball`:`flank`});g.push(...o.moves),_+=o.estimatedMinutes,v=o.endA,y+=t.cells.length}if(g.length===0)return $(`all ${h} surface cell(s) are unreachable at the ${o}'s contact attitude${h===p.surfaceCells?` — nothing to sweep`:``}`);let b=[];if(h>0){let e=100*h/p.surfaceCells;b.push(`${h} of ${p.surfaceCells} cell(s) (${e.toFixed(0)}%) unreachable by the ${o} — left standing, finish them another way`)}let x=0;for(let e=0;e<f.length;e+=3){let t=Math.hypot(f[e+1],f[e+2]-s.axisZ);t>x&&(x=t)}x>s.effectiveRadius+1e-6&&b.push(`the model extends ${(x-s.effectiveRadius).toFixed(1)}mm above the stock radius — that part cannot be finished`);let S=100*y/p.surfaceCells;return{moves:g,minutes:_,error:null,summary:`${m.length} ${o} patch(es), ${y}/${p.surfaceCells} cell(s) (${S.toFixed(0)}%) swept, ~${_.toFixed(1)} min`+(b.length>0?` · ${b.join(` · `)}`:``)}}case`drill`:{let i=`select holes (interior circles)`,{parts:a,error:o}=kc(t.sources,e.featureIds,i);if(o)return $(o);let{rotate:s}=vc(t.datumAngle,t.stock),c=[];for(let t of a){let n=ic(t.source.features,t.ids,t.source.transform,e.depth,s);n&&c.push(...n)}if(c.length===0)return $(i);let l=Gr({kind:`drill`,id:e.id,toolId:n.id,targets:c,peckDepth:e.peckDepth,plungeFeed:e.rates?.plungeFeed??bc(n,r.id)?.plungeFeed??r.feedByTool.drill,safeClearance:e.rates?.clearance??5},n);return{moves:l.moves,minutes:l.estimatedMinutes,error:null,summary:`${l.holes} hole(s), ~${l.estimatedMinutes.toFixed(1)} min`}}case`profile`:{let r=`select features (circles or flat faces)`,{parts:o,error:s}=kc(t.sources,e.featureIds,r);if(s)return $(s);let{rotate:c}=vc(t.datumAngle,t.stock),l=[],u=!1,d=!1;for(let e of o){let t=e.ids.every(t=>e.source.features.circles.some(e=>e.id===t)),n=e.ids.every(t=>e.source.features.planes.some(e=>e.id===t)),r=rc(e.source.features,e.ids,e.source.transform,c);r&&r.regions.length!==0&&(t&&(u=!0),n&&(d=!0),l.push(...r.regions))}if(u&&d)return $(`select either faces or holes for this operation, not both`);if(l.length===0)return $(r);let f=pc(t.stock),p=Math.max(0,e.bottomAllowance),m=Oc(e.startDepth,e.endDepth,p,f);if(!m)return $(`end depth must be at or below start depth, and the allowance must leave something to cut`);let h=e.finishingOnly?Math.max(m.topZ-m.floorZ+1e-6,.1):e.stepDown,g=di({kind:`profile`,id:e.id,toolId:n.id,contours:l,side:e.side,sideAllowance:e.sideAllowance,bottomAllowance:0,topZ:m.topZ,floorZ:m.floorZ,stepDown:h,tabs:e.tabs??void 0,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5,finishingOnly:e.finishingOnly,footprint:e.cutBeyondStock===!1?hc(t.stock,t.datumAngle!==0):void 0},n),_=g.moves,v=g.estimatedMinutes,y=``;if(e.clearToStock&&e.side===`outside`){let r=gc(e.finishingOnly?{...e,stepDown:h}:e,n,l,m,Ec(n),i,a,t,t.datumAngle!==0);r?(_=_.concat(r.moves),v+=r.minutes,y=`, waste cleared to the stock edge`):y=` · frame thinner than the tool — waste left standing`}return{moves:_,minutes:v,error:null,summary:`${g.passes} wall pass(es) / ${g.levels} level(s), z${m.topZ.toFixed(1)} → z${m.floorZ.toFixed(1)}`+(p>0?`, ${p}mm floor allowance`:``)+(e.sideAllowance===0?``:`, ${e.sideAllowance}mm side offset`)+(e.finishingOnly?`, finishing pass only`:``)+(e.cutBeyondStock?`, tail stock cut-over`:``)+`, ~${v.toFixed(1)} min`+y+(g.warnings.length>0?` · ${g.warnings.join(` · `)}`:``)}}case`chamfer`:{if(n.type!==`vbit`)return $(`chamfer needs a V-bit — pick a chamfering/engraving bit from the library`);if(n.vAngle===void 0||n.vAngle<=0||n.vAngle>=180)return $(`this V-bit has no usable tip angle — set the included angle in the tool library`);let r=`select circles or flat faces to chamfer`,{parts:o,error:s}=kc(t.sources,e.featureIds,r);if(s)return $(s);let{rotate:c}=vc(t.datumAngle,t.stock),l=[];for(let e of o){let t=uc(e.source.features,e.ids,e.source.transform,c);t&&l.push(...t.loops)}if(l.length===0)return $(r);let u=Ur({kind:`chamfer`,id:e.id,toolId:n.id,loops:l,mode:e.mode,side:e.side,direction:e.direction,depth:e.depth,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5},n);return{moves:u.moves,minutes:u.estimatedMinutes,error:null,summary:`${l.length} loop(s), ${e.depth}mm chamfer, ~${u.estimatedMinutes.toFixed(1)} min`}}case`cylChamfer`:{if(t.stock.axisMode!==`4-axis`)return $(`cylinder chamfer needs 4-axis mode (Stock tab)`);if(n.type!==`vbit`)return $(`cylinder chamfer needs a V-bit — pick a chamfering/engraving bit from the library`);if(n.vAngle===void 0||n.vAngle<=0||n.vAngle>=180)return $(`this V-bit has no usable tip angle — set the included angle in the tool library`);let r=`select edge circles around the stock axis — face-op step edges and stock end rims show as green circles, and on-axis model circles work too`,{parts:i,error:o}=kc(t.sources,e.featureIds,r);if(o)return $(o);let s=Bn(t.stock),c=[];for(let e of i){let t=dc(e.source.features,e.ids,e.source.transform,s);t&&c.push(...t.edges)}if(c.length===0)return $(r);let l=e.finishingOnly?Math.max(...c.map(t=>{let n=t.diameter/2;return(e.depth<=1e-9?s.effectiveRadius:n)-(n-e.depth)}),.1):NaN,u=lr({kind:`cylChamfer`,id:e.id,toolId:n.id,edges:c,depth:e.depth,stepDown:e.finishingOnly?l:e.stepDown,rotation:e.rotation,plungeFeed:a,clearance:e.rates?.clearance},s,n,t.startA);return{moves:u.moves,minutes:u.estimatedMinutes,error:null,summary:`${c.length} edge(s) × ${u.passes/c.length} pass(es) `+(e.depth<=1e-9?`up-and-out from the anchor Ø`:`${e.depth.toFixed(2)}mm below the rim (${u.width.toFixed(2)}mm wide)`)+(e.finishingOnly?`, finishing pass only`:``)+`, ${u.chamferAngleDeg.toFixed(0)}° from the bit, ~${u.estimatedMinutes.toFixed(1)} min`}}case`threadMill`:{if(n.type!==`threadmill`)return $(`thread milling needs a thread mill — pick one from the Threadmill family in the library`);let r=`select the bore or boss to thread — the rim circle, the cylinder wall, or the flat face around it`,{parts:o,error:s}=kc(t.sources,e.featureIds,r);if(s)return $(s);let{rotate:c}=vc(t.datumAngle,t.stock),l=[];for(let e of o)try{let t=fc(e.source.features,e.ids,e.source.transform,c);t&&l.push(...t.targets)}catch(e){return $(e instanceof Error?e.message:String(e))}if(l.length===0)return $(r);if(l.some(e=>Math.abs(e.radius-l[0].radius)>.02))return $(`the selection mixes diameters — one thread op cuts one size; add a second Thread mill op for the other`);if(l.some(t=>t.internal!==e.internal))return $(e.internal?`the op is set to internal but the selection holds a boss outline — flip Inside/Outside or split the ops`:`the op is set to external but the selection holds a bore — flip Inside/Outside or split the ops`);let u=pc(t.stock)-e.startDepth,d=e.endDepth-e.startDepth;if(!(d>0))return $(`the thread length must be positive — set the end depth below the start depth`);let f=(e.nominalDiameter-1.0825*e.pitch)/2,p=l.map(t=>({center:t.center,internal:e.internal,topZ:u,depth:d,...e.internal?{boreRadius:Math.max(t.radius,f)}:{}}));try{let t=Ar({kind:`threadMill`,id:e.id,toolId:n.id,targets:p,nominalDiameter:e.nominalDiameter,pitch:e.pitch,starts:e.starts,tolerance:e.tolerance,rotation:e.rotation,stepOver:e.stepOver,feed:i,plungeFeed:a,safeClearance:e.rates?.clearance??5},n);return{moves:t.moves,minutes:t.estimatedMinutes,error:null,summary:`${l.length} ${e.internal?`internal`:`external`} thread(s), ${e.nominalDiameter}×${e.pitch}`+(e.starts>1?` (${e.starts} starts)`:``)+` ${e.rotation}, ${d.toFixed(1)}mm, ${t.passes} pass(es) incl. spring`+(e.tolerance>0?`, ${e.tolerance}mm fit`:``)+(t.notes.length>0?` · ${t.notes.join(` · `)}`:``)+`, ~${t.estimatedMinutes.toFixed(1)} min`}}catch(e){return $(e instanceof Error?e.message:String(e))}}case`engrave`:{let r=`select artwork paths (drop an SVG onto the viewport to create one)`,{parts:o,error:s}=kc(t.sources,e.featureIds,r);if(s)return $(s);let{rotate:c}=vc(t.datumAngle,t.stock),l=Bn(t.stock).axisZ,u=[],d=[],f=0,p=0;for(let e of o){let t=e.source.artworkFrame;if(!t)return $(`engrave cuts artwork paths — the selection holds model or primitive features`);let n=Ys(e.source.transform),r=new Set(e.ids);for(let i of e.source.features.paths)if(r.has(i.id)){if(t.kind===`flat`){let e=i.points.map(e=>c?c(n(e)):n(e)),t=e[0].z;if(e.some(e=>Math.abs(e.z-t)>.05))return $(`the artwork's plane must be horizontal to engrave — rotate it flat, or use the wrapped presentation`);f=t,u.push(e.map(e=>({x:e.x,y:e.y})))}else{p=t.diameter;let e=t.diameter/2,r=Math.PI*t.diameter,a=[];i.points.forEach((t,i)=>{let o=n(t);if(Math.abs(Math.hypot(o.y,o.z-l)-e)>.05)throw Error(`the wrapped artwork must sit ON the stock axis — move it back onto the axis before engraving`);let s=Math.atan2(o.y,o.z-l)*180/Math.PI/360*r;if(i>0){let e=a[i-1].x;for(;s-e>r/2;)s-=r;for(;e-s>r/2;)s+=r}a.push({x:s,y:o.x})}),d.push(a)}}}if(u.length>0&&d.length>0)return $(`one engrave op cuts in one frame — split flat and wrapped artwork into separate ops`);let m=u.length>0?u:d;if(m.length===0)return $(r);let h=dr({id:e.id,toolId:n.id,paths:m,depth:e.depth,stepDown:e.finishingOnly?e.depth:e.stepDown,feed:i,plungeFeed:a,clearance:e.rates?.clearance??5,frame:u.length>0?{kind:`flat`,surfaceZ:f}:{kind:`wrapped`,radius:p/2,surfaceZ:l+p/2,datumAngle:0,startA:t.startA},...n.type===`laser`?{laser:{focus:n.focus??1,power:(Sc(n,t.stock.materialId,e.rates)??n.spindleRpm)/100}}:{}}),g=p>0&&h.effectiveFeed<i-1e-9?` — rotary-limited to ~${h.effectiveFeed.toFixed(0)} mm/min on the surface`:``;return{moves:h.moves,minutes:h.estimatedMinutes,error:null,summary:`${m.length} path(s), ${e.depth}mm deep${e.finishingOnly?`, finishing pass only`:``}${g}, ~${h.estimatedMinutes.toFixed(1)} min`}}}}catch(e){return $(String(e))}}let Mc=null,Nc=e=>self.postMessage(e,{transfer:[]});self.onmessage=e=>{let t=e.data;if(t.type===`seed`){Mc=new Bt,Mc.setAttribute(`position`,new At(t.seed.positions,3));return}if(!Mc){Nc({type:`result`,id:t.id,result:{moves:[],minutes:0,error:`generation worker: no model seeded`,summary:null,finalA:t.startA}});return}let n=Ac(t.op,nr(Mc,t));Nc({type:`result`,id:t.id,result:n})}})();