// @flow

const browser = require('../util/browser');
const shaders = require('../shaders');
const assert = require('assert');
const {ProgramConfiguration} = require('../data/program_configuration');
const VertexArrayObject = require('./vertex_array_object');
const Context = require('../gl/context');
const util = require('../util/util');

import type {SegmentVector} from '../data/segment';
import type VertexBuffer from '../gl/vertex_buffer';
import type IndexBuffer from '../gl/index_buffer';
import type DepthMode from '../gl/depth_mode';
import type StencilMode from '../gl/stencil_mode';
import type ColorMode from '../gl/color_mode';
import type {PossiblyEvaluated, PossiblyEvaluatedPropertyValue} from '../style/properties';
import type Uniforms from './uniform_binding';

export type DrawMode =
    | $PropertyType<WebGLRenderingContext, 'LINES'>
    | $PropertyType<WebGLRenderingContext, 'TRIANGLES'>;

class Program {
    program: WebGLProgram;
    uniforms: {[string]: WebGLUniformLocation};
    attributes: {[string]: number};
    numAttributes: number;
    boundUniforms: Uniforms;

    constructor(context: Context,
                source: {fragmentSource: string, vertexSource: string},
                configuration: ProgramConfiguration,
                showOverdrawInspector: boolean,
                staticUniformBindings: any   /* TODO */) {
        const gl = context.gl;
        this.program = gl.createProgram();

        const defines = configuration.defines().concat(
            `#define DEVICE_PIXEL_RATIO ${browser.devicePixelRatio.toFixed(1)}`);
        if (showOverdrawInspector) {
            defines.push('#define OVERDRAW_INSPECTOR;');
        }

        const fragmentSource = defines.concat(shaders.prelude.fragmentSource, source.fragmentSource).join('\n');
        const vertexSource = defines.concat(shaders.prelude.vertexSource, source.vertexSource).join('\n');

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);
        assert(gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS), (gl.getShaderInfoLog(fragmentShader): any));
        gl.attachShader(this.program, fragmentShader);

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);
        assert(gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS), (gl.getShaderInfoLog(vertexShader): any));
        gl.attachShader(this.program, vertexShader);

        // Manually bind layout attributes in the order defined by their
        // ProgramInterface so that we don't dynamically link an unused
        // attribute at position 0, which can cause rendering to fail for an
        // entire layer (see #4607, #4728)
        const layoutAttributes = configuration.layoutAttributes || [];
        for (let i = 0; i < layoutAttributes.length; i++) {
            gl.bindAttribLocation(this.program, i, layoutAttributes[i].name);
        }

        gl.linkProgram(this.program);
        assert(gl.getProgramParameter(this.program, gl.LINK_STATUS), (gl.getProgramInfoLog(this.program): any));

        this.numAttributes = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);

        this.attributes = {};
        this.uniforms = {};

        for (let i = 0; i < this.numAttributes; i++) {
            const attribute = gl.getActiveAttrib(this.program, i);
            if (attribute) {
                this.attributes[attribute.name] = gl.getAttribLocation(this.program, attribute.name);
            }
        }

        const numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; i++) {
            const uniform = gl.getActiveUniform(this.program, i);
            if (uniform) {
                this.uniforms[uniform.name] = gl.getUniformLocation(this.program, uniform.name);
            }
        }

        // TODO Eventually we will no longer have to store the intermediary location after this, and instead just construct uniform bindings directly
        this.boundUniforms = {};
        if (staticUniformBindings) {      // TODO should delete this if eventually
            this.boundUniforms = staticUniformBindings(context, configuration.binders, this.uniforms);
        }
    }

    draw(context: Context,
         drawMode: DrawMode,
         layerID: string,
         layoutVertexBuffer: VertexBuffer,
         indexBuffer: IndexBuffer,
         segments: SegmentVector,
         configuration: ?ProgramConfiguration,
         dynamicLayoutBuffer: ?VertexBuffer,
         dynamicLayoutBuffer2: ?VertexBuffer) {

        const gl = context.gl;

        const primitiveSize = {
            [gl.LINES]: 2,
            [gl.TRIANGLES]: 3
        }[drawMode];

        for (const segment of segments.get()) {
            const vaos = segment.vaos || (segment.vaos = {});
            const vao = vaos[layerID] || (vaos[layerID] = new VertexArrayObject());

            vao.bind(
                context,
                this,
                layoutVertexBuffer,
                indexBuffer,
                configuration && configuration.paintVertexBuffer,
                segment.vertexOffset,
                dynamicLayoutBuffer,
                dynamicLayoutBuffer2
            );

            gl.drawElements(
                drawMode,
                segment.primitiveLength * primitiveSize,
                gl.UNSIGNED_SHORT,
                segment.primitiveOffset * primitiveSize * 2);
        }
    }

    _draw(context: Context,
         drawMode: DrawMode,
         depthMode: DepthMode,
         stencilMode: StencilMode,
         colorMode: ColorMode,
         // uniform values
         layerID: string,
         layoutVertexBuffer: VertexBuffer,
         indexBuffer: IndexBuffer,
         segments: SegmentVector,
         // paint prop binders, ?? or just use from ProgramConfiguration
         currentProperties: PossiblyEvaluated<Properties>,
         zoom: number,
         configuration: ?ProgramConfiguration,
         dynamicLayoutBuffer: ?VertexBuffer,
         dynamicLayoutBuffer2: ?VertexBuffer) {

        const gl = context.gl;

        context.setDepthMode(depthMode);
        context.setStencilMode(stencilMode);
        context.setColorMode(colorMode);

        // const uniforms = configuration.getUniforms(currentProperties, {zoom: zoom});    // TODO: concat w uniformValues


        const primitiveSize = {
            [gl.LINES]: 2,
            [gl.TRIANGLES]: 3
        }[drawMode];

        for (const segment of segments.get()) {
            const vaos = segment.vaos || (segment.vaos = {});
            const vao = vaos[layerID] || (vaos[layerID] = new VertexArrayObject());

            vao.bind(
                context,
                this,
                layoutVertexBuffer,
                indexBuffer,
                configuration && configuration.paintVertexBuffer,
                segment.vertexOffset,
                dynamicLayoutBuffer,
                dynamicLayoutBuffer2
            );

            gl.drawElements(
                drawMode,
                segment.primitiveLength * primitiveSize,
                gl.UNSIGNED_SHORT,
                segment.primitiveOffset * primitiveSize * 2);
        }
    }
}

module.exports = Program;
