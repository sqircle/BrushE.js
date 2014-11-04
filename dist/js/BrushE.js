!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.BrushE=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = require('./lib/BrushE.js');

},{"./lib/BrushE.js":2}],2:[function(require,module,exports){
var Brush, BrushE, CanvasSurface, Controls;

CanvasSurface = require("./brushe/CanvasSurface");

Brush = require("./brushe/Brush");

Controls = require("./brushe/Controls");

BrushE = (function() {
  function BrushE(canvas, brush) {
    this.surface = new CanvasSurface(canvas);
    this.brush = new Brush(brush, this.surface);
    this.controls = new Controls(this.surface, this.brush);
  }

  BrushE.prototype.setBrush = function(brush) {
    this.brush = null;
    this.brush = new Brush(brush, this.surface);
    return this.controls.setBrush(this.brush);
  };

  return BrushE;

})();

module.exports = BrushE;

},{"./brushe/Brush":4,"./brushe/CanvasSurface":5,"./brushe/Controls":7}],3:[function(require,module,exports){
var AssertException;

AssertException = (function() {
  function AssertException(message) {
    this.message = message;
  }

  AssertException.prototype.toString = function() {
    return "AssertException: " + this.message;
  };

  return AssertException;

})();

module.exports = AssertException;

},{}],4:[function(require,module,exports){
var Brush, Mapping, clamp, color, constants, fmodf, hypot, hypotf, math, max3, min3, rand_gauss;

color = require('onecolor');

constants = require('./constants');

Mapping = require('./Mapping');

math = require('./math');

fmodf = math.fmodf;

clamp = math.clamp;

hypot = math.hypot;

hypotf = math.hypotf;

rand_gauss = math.rand_gauss;

max3 = math.max3;

min3 = math.min3;

Brush = (function() {
  function Brush(brushsetting, surface) {
    var i;
    this.surface = surface;
    this.states = new Array(constants.STATE_COUNT);
    this.settings = new Array(constants.BRUSH_SETTINGS_COUNT);
    this.settings_value = new Array(constants.BRUSH_SETTINGS_COUNT);
    this.speed_mapping_gamma = new Array(2);
    this.speed_mapping_m = new Array(2);
    this.speed_mapping_q = new Array(2);
    this.stroke_current_idling_time = 0;
    this.stroke_total_painting_time = 0;
    i = 0;
    while (i < constants.BRUSH_SETTINGS_COUNT) {
      this.settings[i] = new Mapping(constants.INPUT_COUNT);
      i++;
    }
    this.print_inputs = false;
    i = 0;
    while (i < constants.STATE_COUNT) {
      this.states[i] = 0;
      i++;
    }
    this.readmyb_json(brushsetting);
  }

  Brush.prototype.readmyb_json = function(settings) {
    return this.setSettings(settings);
  };

  Brush.prototype.setSettings = function(settings) {
    var i, idx, m, prop, propidx, setting;
    for (setting in settings) {
      idx = eval("constants.BRUSH_" + setting.toUpperCase());
      if (idx >= constants.BRUSH_SETTINGS_COUNT) {
        return;
      }
      m = this.settings[idx];
      m.base_value = settings[setting].base_value;
      m.inputs_used = 0;
      for (prop in settings[setting].pointsList) {
        propidx = eval("constants.INPUT_" + prop.toUpperCase());
        m.pointsList[propidx].n = settings[setting].pointsList[prop].length / 2;
        i = 0;
        while (i < m.pointsList[propidx].n) {
          m.pointsList[propidx].xvalues[i] = settings[setting].pointsList[prop][i * 2];
          m.pointsList[propidx].yvalues[i] = settings[setting].pointsList[prop][i * 2 + 1];
          i++;
        }
        m.inputs_used = 1;
      }
    }
    return this.settings_base_values_have_changed();
  };

  Brush.prototype.new_stroke = function(x, y) {
    var i;
    i = 0;
    while (i < constants.STATE_COUNT) {
      this.states[i] = 0;
      this.settings_value[i] = 0;
      i++;
    }
    this.states[constants.STATE_X] = x;
    this.states[constants.STATE_Y] = y;
    this.states[constants.STATE_STROKE] = 0;
    this.states[constants.STATE_STROKE_STARTED] = 0;
    this.stroke_current_idling_time = 0;
    this.stroke_total_painting_time = 0;
    this.surface.dab_count = 0;
    this.surface.getcolor_count = 0;
    return this.stroke_to(this.surface, x, y, 0, 0, 0, 10);
  };

  Brush.prototype.set_base_value = function(id, value) {
    assert(id >= 0 && id < constants.BRUSH_SETTINGS_COUNT, "id < BRUSH_SETTINGS_COUNT");
    this.settings[id].base_value = value;
    return this.settings_base_values_have_changed();
  };

  Brush.prototype.set_mapping_n = function(id, input, n) {
    assert(id >= 0 && id < constants.BRUSH_SETTINGS_COUNT, "id <BRUSH_SETTINGS_COUNT");
    return this.settings[id].set_n(input, n);
  };

  Brush.prototype.set_mapping_point = function(id, input, index, x, y) {
    assert(id >= 0 && id < constants.BRUSH_SETTINGS_COUNT, "id<BRUSH_SETTINGS_COUNT");
    return this.settings[id].set_point(input, index, x, y);
  };

  Brush.prototype.exp_decay = function(t_const, t) {
    if (t_const <= 0.001) {
      return 0.0;
    } else {
      return Math.exp(-t / t_const);
    }
  };

  Brush.prototype.settings_base_values_have_changed = function() {
    var c1, fix1_x, fix1_y, fix2_dy, fix2_x, gamma, i, m, q, _results;
    i = 0;
    _results = [];
    while (i < 2) {
      gamma = void 0;
      if (i === 0) {
        gamma = this.settings[constants.BRUSH_SPEED1_GAMMA].base_value;
      } else {
        gamma = this.settings[constants.BRUSH_SPEED2_GAMMA].base_value;
      }
      gamma = Math.exp(gamma);
      fix1_x = 45.0;
      fix1_y = 0.5;
      fix2_x = 45.0;
      fix2_dy = 0.015;
      c1 = Math.log(fix1_x + gamma);
      m = fix2_dy * (fix2_x + gamma);
      q = fix1_y - m * c1;
      this.speed_mapping_gamma[i] = gamma;
      this.speed_mapping_m[i] = m;
      this.speed_mapping_q[i] = q;
      _results.push(i++);
    }
    return _results;
  };

  Brush.prototype.update_states_and_setting_values = function(step_dx, step_dy, step_dpressure, step_declination, step_ascension, step_dtime) {
    var aa, base_radius, dx, dx_old, dy, dy_old, fac, frequency, i, inputs, norm_dist, norm_dx, norm_dy, norm_speed, pressure, radius_log, step_in_dabtime, time_constant, wrap;
    pressure = void 0;
    inputs = new Array(constants.INPUT_COUNT);
    if (step_dtime < 0.0) {
      step_dtime = 0.001;
    } else {
      if (step_dtime === 0.0) {
        step_dtime = 0.001;
      }
    }
    this.states[constants.STATE_X] += step_dx;
    this.states[constants.STATE_Y] += step_dy;
    this.states[constants.STATE_PRESSURE] += step_dpressure;
    this.states[constants.STATE_DECLINATION] += step_declination;
    this.states[constants.STATE_ASCENSION] += step_ascension;
    base_radius = Math.exp(this.settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value);
    this.states[constants.STATE_PRESSURE] = clamp(this.states[constants.STATE_PRESSURE], 0.0, 1.0);
    pressure = this.states[constants.STATE_PRESSURE];
    if (!this.states[constants.STATE_STROKE_STARTED]) {
      if (pressure > this.settings[constants.BRUSH_STROKE_TRESHOLD].base_value + 0.0001) {
        this.states[constants.STATE_STROKE_STARTED] = 1;
        this.states[constants.STATE_STROKE] = 0.0;
      }
    } else {
      if (pressure <= this.settings[constants.BRUSH_STROKE_TRESHOLD].base_value * 0.9 + 0.0001) {
        this.states[constants.STATE_STROKE_STARTED] = 0;
      }
    }
    norm_dx = step_dx / step_dtime / base_radius;
    norm_dy = step_dy / step_dtime / base_radius;
    norm_speed = Math.sqrt(norm_dx * norm_dx + norm_dy * norm_dy);
    norm_dist = norm_speed * step_dtime;
    inputs[constants.INPUT_PRESSURE] = pressure;
    inputs[constants.INPUT_SPEED1] = Math.log(this.speed_mapping_gamma[0] + this.states[constants.STATE_NORM_SPEED1_SLOW]) * this.speed_mapping_m[0] + this.speed_mapping_q[0];
    inputs[constants.INPUT_SPEED2] = Math.log(this.speed_mapping_gamma[1] + this.states[constants.STATE_NORM_SPEED2_SLOW]) * this.speed_mapping_m[1] + this.speed_mapping_q[1];
    inputs[constants.INPUT_RANDOM] = Math.random();
    inputs[constants.INPUT_STROKE] = Math.min(this.states[constants.STATE_STROKE], 1.0);
    inputs[constants.INPUT_DIRECTION] = math.fmodf(Math.atan2(this.states[constants.STATE_DIRECTION_DY], this.states[constants.STATE_DIRECTION_DX]) / (2 * Math.PI) * 360 + 180.0, 180.0);
    inputs[constants.INPUT_TILT_DECLINATION] = this.states[constants.STATE_DECLINATION];
    inputs[constants.INPUT_TILT_ASCENSION] = this.states[constants.STATE_ASCENSION];
    inputs[constants.INPUT_CUSTOM] = this.states[constants.STATE_CUSTOM_INPUT];
    i = 0;
    while (i < constants.BRUSH_SETTINGS_COUNT) {
      if (i === constants.BRUSH_ELLIPTICAL_DAB_RATIO) {
        aa = 0;
      }
      this.settings_value[i] = this.settings[i].calculate(inputs);
      i++;
    }
    fac = 1.0 - this.exp_decay(this.settings_value[constants.BRUSH_SLOW_TRACKING_PER_DAB], 1.0);
    this.states[constants.STATE_ACTUAL_X] += (this.states[constants.STATE_X] - this.states[constants.STATE_ACTUAL_X]) * fac;
    this.states[constants.STATE_ACTUAL_Y] += (this.states[constants.STATE_Y] - this.states[constants.STATE_ACTUAL_Y]) * fac;
    fac = 1.0 - this.exp_decay(this.settings_value[constants.BRUSH_SPEED1_SLOWNESS], step_dtime);
    this.states[constants.STATE_NORM_SPEED1_SLOW] += (norm_speed - this.states[constants.STATE_NORM_SPEED1_SLOW]) * fac;
    fac = 1.0 - this.exp_decay(this.settings_value[constants.BRUSH_SPEED2_SLOWNESS], step_dtime);
    this.states[constants.STATE_NORM_SPEED2_SLOW] += (norm_speed - this.states[constants.STATE_NORM_SPEED2_SLOW]) * fac;
    time_constant = Math.exp(this.settings_value[constants.BRUSH_OFFSET_BY_SPEED_SLOWNESS] * 0.01) - 1.0;
    if (time_constant < 0.002) {
      time_constant = 0.002;
    }
    fac = 1.0 - this.exp_decay(time_constant, step_dtime);
    this.states[constants.STATE_NORM_DX_SLOW] += (norm_dx - this.states[constants.STATE_NORM_DX_SLOW]) * fac;
    this.states[constants.STATE_NORM_DY_SLOW] += (norm_dy - this.states[constants.STATE_NORM_DY_SLOW]) * fac;
    dx = step_dx / base_radius;
    dy = step_dy / base_radius;
    step_in_dabtime = hypotf(dx, dy);
    fac = 1.0 - this.exp_decay(Math.exp(this.settings_value[constants.BRUSH_DIRECTION_FILTER] * 0.5) - 1.0, step_in_dabtime);
    dx_old = this.states[constants.STATE_DIRECTION_DX];
    dy_old = this.states[constants.STATE_DIRECTION_DY];
    if (Math.sqrt(dx_old - dx) + Math.sqrt(dy_old - dy) > Math.sqrt(dx_old - (-dx)) + Math.sqrt(dy_old - (-dy))) {
      dx = -dx;
      dy = -dy;
    }
    this.states[constants.STATE_DIRECTION_DX] += (dx - this.states[constants.STATE_DIRECTION_DX]) * fac;
    this.states[constants.STATE_DIRECTION_DY] += (dy - this.states[constants.STATE_DIRECTION_DY]) * fac;
    fac = 1.0 - this.exp_decay(this.settings_value[constants.BRUSH_CUSTOM_INPUT_SLOWNESS], 0.1);
    this.states[constants.STATE_CUSTOM_INPUT] += (this.settings_value[constants.BRUSH_CUSTOM_INPUT] - this.states[constants.STATE_CUSTOM_INPUT]) * fac;
    frequency = Math.exp(-this.settings_value[constants.BRUSH_STROKE_DURATION_LOGARITHMIC]);
    this.states[constants.STATE_STROKE] += norm_dist * frequency;
    if (this.states[constants.STATE_STROKE] < 0) {
      this.states[constants.STATE_STROKE] = 0;
    }
    wrap = 1.0 + this.settings_value[constants.BRUSH_STROKE_HOLDTIME];
    if (this.states[constants.STATE_STROKE] > wrap) {
      if (wrap > 9.9 + 1.0) {
        this.states[constants.STATE_STROKE] = 1.0;
      } else {
        this.states[constants.STATE_STROKE] = math.fmodf(this.states[constants.STATE_STROKE], wrap);
        if (this.states[constants.STATE_STROKE] < 0) {
          this.states[constants.STATE_STROKE] = 0;
        }
      }
    }
    radius_log = this.settings_value[constants.BRUSH_RADIUS_LOGARITHMIC];
    this.states[constants.STATE_ACTUAL_RADIUS] = Math.exp(radius_log);
    if (this.states[constants.STATE_ACTUAL_RADIUS] < constants.ACTUAL_RADIUS_MIN) {
      this.states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MIN;
    }
    if (this.states[constants.STATE_ACTUAL_RADIUS] > constants.ACTUAL_RADIUS_MAX) {
      this.states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MAX;
    }
    this.states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO] = this.settings_value[constants.BRUSH_ELLIPTICAL_DAB_RATIO];
    return this.states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_ANGLE] = this.settings_value[constants.BRUSH_ELLIPTICAL_DAB_ANGLE];
  };

  Brush.prototype.prepare_and_draw_dab = function(surface) {
    var a, alpha, alpha_correction, alpha_dab, amp, b, base_radius, beta, beta_dab, color_h, color_s, color_v, colorhsl, colorhsv, colorrgb, dabs_per_pixel, eraser_target_alpha, fac, g, hardness, opaque, px, py, r, radius, radius_log, smudge_radius, x, y;
    if (this.settings_value[constants.BRUSH_OPAQUE] < 0) {
      settings_value[constants.BRUSH_OPAQUE] = 0;
    }
    opaque = this.settings_value[constants.BRUSH_OPAQUE] * this.settings_value[constants.BRUSH_OPAQUE_MULTIPLY];
    opaque = math.clamp(opaque, 0.0, 1.0);
    if (this.settings_value[constants.BRUSH_OPAQUE_LINEARIZE]) {
      dabs_per_pixel = (this.settings[constants.BRUSH_DABS_PER_ACTUAL_RADIUS].base_value + this.settings[constants.BRUSH_DABS_PER_BASIC_RADIUS].base_value) * 2.0;
      if (dabs_per_pixel < 1.0) {
        dabs_per_pixel = 1.0;
      }
      dabs_per_pixel = 1.0 + this.settings[constants.BRUSH_OPAQUE_LINEARIZE].base_value * (dabs_per_pixel - 1.0);
      alpha = opaque;
      beta = 1.0 - alpha;
      beta_dab = Math.pow(beta, 1.0 / dabs_per_pixel);
      alpha_dab = 1.0 - beta_dab;
      opaque = alpha_dab;
    }
    x = this.states[constants.STATE_ACTUAL_X];
    y = this.states[constants.STATE_ACTUAL_Y];
    base_radius = Math.exp(this.settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value);
    if (this.settings_value[constants.BRUSH_OFFSET_BY_SPEED]) {
      x += this.states[constants.STATE_NORM_DX_SLOW] * this.settings_value[constants.BRUSH_OFFSET_BY_SPEED] * 0.1 * base_radius;
      y += this.states[constants.STATE_NORM_DY_SLOW] * this.settings_value[constants.BRUSH_OFFSET_BY_SPEED] * 0.1 * base_radius;
    }
    if (this.settings_value[constants.BRUSH_OFFSET_BY_RANDOM]) {
      amp = this.settings_value[constants.BRUSH_OFFSET_BY_RANDOM];
      if (amp < 0.0) {
        amp = 0.0;
      }
      x += rand_gauss() * amp * base_radius;
      y += rand_gauss() * amp * base_radius;
    }
    radius = this.states[constants.STATE_ACTUAL_RADIUS];
    if (this.settings_value[constants.BRUSH_RADIUS_BY_RANDOM]) {
      radius_log = this.settings_value[constants.BRUSH_RADIUS_LOGARITHMIC];
      radius_log += rand_gauss() * this.settings_value[constants.BRUSH_RADIUS_BY_RANDOM];
      radius = Math.exp(radius_log);
      radius = clamp(radius, constants.ACTUAL_RADIUS_MIN, constants.ACTUAL_RADIUS_MAX);
      alpha_correction = this.states[constants.STATE_ACTUAL_RADIUS] / radius;
      alpha_correction = Math.sqrt(alpha_correction);
      if (alpha_correction <= 1.0) {
        opaque *= alpha_correction;
      }
    }
    colorhsv = new color.HSV(this.settings[constants.BRUSH_COLOR_HUE].base_value, this.settings[constants.BRUSH_COLOR_SATURATION].base_value, this.settings[constants.BRUSH_COLOR_VALUE].base_value);
    color_h = colorhsv.hue();
    color_s = colorhsv.saturation();
    color_v = colorhsv.value();
    eraser_target_alpha = 1.0;
    if (this.settings_value[constants.BRUSH_SMUDGE] > 0.0) {
      color_h = colorhsv.red();
      color_s = colorhsv.green();
      color_v = colorhsv.blue();
      fac = this.settings_value[constants.BRUSH_SMUDGE];
      if (fac > 1.0) {
        fac = 1.0;
      }
      eraser_target_alpha = (1 - fac) * 1.0 + fac * this.states[constants.STATE_SMUDGE_A];
      eraser_target_alpha = clamp(eraser_target_alpha, 0.0, 1.0);
      if (eraser_target_alpha > 0) {
        color_h = (fac * this.states[constants.STATE_SMUDGE_RA] + (1 - fac) * color_h) / eraser_target_alpha;
        color_s = (fac * this.states[constants.STATE_SMUDGE_GA] + (1 - fac) * color_s) / eraser_target_alpha;
        color_v = (fac * this.states[constants.STATE_SMUDGE_BA] + (1 - fac) * color_v) / eraser_target_alpha;
      } else {
        color_h = 1.0;
        color_s = 0.0;
        color_v = 0.0;
      }
      colorrgb = new color.RGB(color_h, color_s, color_v);
      color_h = colorhsv.hue();
      color_s = colorhsv.saturation();
      color_v = colorhsv.value();
    }
    if (this.settings_value[constants.BRUSH_SMUDGE_LENGTH] < 1.0 && (this.settings_value[constants.BRUSH_SMUDGE] !== 0.0 || !this.settings[constants.BRUSH_SMUDGE].is_constant())) {
      smudge_radius = radius * Math.exp(this.settings_value[constants.BRUSH_SMUDGE_RADIUS_LOG]);
      smudge_radius = clamp(smudge_radius, constants.ACTUAL_RADIUS_MIN, constants.ACTUAL_RADIUS_MAX);
      fac = this.settings_value[constants.BRUSH_SMUDGE_LENGTH];
      if (fac < 0.0) {
        fac = 0;
      }
      px = Math.round(x);
      py = Math.round(y);
      surface.get_color(px, py, smudge_radius);
      r = surface.r;
      g = surface.g;
      b = surface.b;
      a = surface.a;
      this.states[constants.STATE_SMUDGE_A] = fac * this.states[constants.STATE_SMUDGE_A] + (1 - fac) * a;
      this.states[constants.STATE_SMUDGE_A] = clamp(this.states[constants.STATE_SMUDGE_A], 0.0, 1.0);
      this.states[constants.STATE_SMUDGE_RA] = fac * this.states[constants.STATE_SMUDGE_RA] + (1 - fac) * r * a;
      this.states[constants.STATE_SMUDGE_GA] = fac * this.states[constants.STATE_SMUDGE_GA] + (1 - fac) * g * a;
      this.states[constants.STATE_SMUDGE_BA] = fac * this.states[constants.STATE_SMUDGE_BA] + (1 - fac) * b * a;
    }
    if (this.settings_value[constants.BRUSH_ERASER]) {
      eraser_target_alpha *= 1.0 - this.settings_value[constants.BRUSH_ERASER];
    }
    color_h += this.settings_value[constants.BRUSH_CHANGE_COLOR_H];
    color_s += this.settings_value[constants.BRUSH_CHANGE_COLOR_HSV_S];
    color_v += this.settings_value[constants.BRUSH_CHANGE_COLOR_V];
    if (this.settings_value[constants.BRUSH_CHANGE_COLOR_L] || this.settings_value[constants.BRUSH_CHANGE_COLOR_HSL_S]) {
      colorhsv = new color.HSV(color_h, color_s, color_v);
      colorrgb = new color.RGB(colorhsv.red(), colorhsv.green(), colorhsv.blue());
      colorrgb.lightness(colorrgb.lightness() + this.settings_value[constants.BRUSH_CHANGE_COLOR_L]);
      colorrgb.saturation(colorrgb.saturation() + this.settings_value[constants.BRUSH_CHANGE_COLOR_HSL_S]);
      colorhsl = new color.HSL(colorrgb.hue(), colorrgb.saturation(), colorrgb.lightness());
      colorrgb = new color.RGB(colorhsl.red(), colorhsl.green(), colorhsl.blue());
      color_h = colorrgb.hue();
      color_s = colorrgb.saturation();
      color_v = colorrgb.value();
    }
    hardness = this.settings_value[constants.BRUSH_HARDNESS];
    colorhsv = new color.HSV(color_h, color_s, color_v);
    return surface.draw_dab(x, y, radius, colorhsv.red(), colorhsv.green(), colorhsv.blue(), opaque, hardness, eraser_target_alpha, this.states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO], this.states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_ANGLE]);
  };

  Brush.prototype.count_dabs_to = function(x, y, pressure, dt) {
    var angle_rad, base_radius, cs, dist, res1, res2, res3, sn, xx, xxr, yy, yyr;
    dist = void 0;
    if (this.states[constants.STATE_ACTUAL_RADIUS] === 0.0) {
      this.states[constants.STATE_ACTUAL_RADIUS] = Math.exp(this.settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value);
    }
    if (this.states[constants.STATE_ACTUAL_RADIUS] < constants.ACTUAL_RADIUS_MIN) {
      this.states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MIN;
    }
    if (this.states[constants.STATE_ACTUAL_RADIUS] > constants.ACTUAL_RADIUS_MAX) {
      this.states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MAX;
    }
    base_radius = Math.exp(this.settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value);
    if (base_radius < constants.ACTUAL_RADIUS_MIN) {
      base_radius = constants.ACTUAL_RADIUS_MIN;
    }
    if (base_radius > constants.ACTUAL_RADIUS_MAX) {
      base_radius = constants.ACTUAL_RADIUS_MAX;
    }
    xx = x - this.states[constants.STATE_X];
    yy = y - this.states[constants.STATE_Y];
    if (this.states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO] > 1.0) {
      angle_rad = this.states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_ANGLE] / 360 * 2 * Math.PI;
      cs = Math.cos(angle_rad);
      sn = Math.sin(angle_rad);
      yyr = (yy * cs - xx * sn) * this.states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO];
      xxr = yy * sn + xx * cs;
      dist = Math.sqrt(yyr * yyr + xxr * xxr);
    } else {
      dist = hypotf(xx, yy);
    }
    res1 = dist / this.states[constants.STATE_ACTUAL_RADIUS] * this.settings[constants.BRUSH_DABS_PER_ACTUAL_RADIUS].base_value;
    res2 = dist / base_radius * this.settings[constants.BRUSH_DABS_PER_BASIC_RADIUS].base_value;
    res3 = dt * this.settings[constants.BRUSH_DABS_PER_SECOND].base_value;
    return res1 + res2 + res3;
  };

  Brush.prototype.stroke_to = function(surface, x, y, pressure, xtilt, ytilt, dtime) {
    var NO, UNKNOWN, YES, base_radius, cos_alpha, dist_moved, dist_todo, dtime_left, e, fac, frac, i, painted, painted_now, rad, step_ascension, step_declination, step_dpressure, step_dtime, step_dx, step_dy, tilt_ascension, tilt_declination;
    tilt_ascension = 0.0;
    tilt_declination = 90.0;
    if (xtilt !== 0 || ytilt !== 0) {
      xtilt = clamp(xtilt, -1.0, 1.0);
      ytilt = clamp(ytilt, -1.0, 1.0);
      tilt_ascension = 180.0 * Math.atan2(-xtilt, ytilt) / Math.PI;
      e = void 0;
      if (Math.abs(xtilt) > Math.abs(ytilt)) {
        e = Math.sqrt(1 + ytilt * ytilt);
      } else {
        e = Math.sqrt(1 + xtilt * xtilt);
      }
      rad = hypot(xtilt, ytilt);
      cos_alpha = rad / e;
      if (cos_alpha >= 1.0) {
        cos_alpha = 1.0;
      }
      tilt_declination = 180.0 * Math.acos(cos_alpha) / Math.PI;
    }
    pressure = clamp(pressure, 0.0, 1.0);
    if (dtime <= 0) {
      dtime = 0.0001;
    }
    if (dtime > 0.100 && pressure && this.states[constants.STATE_PRESSURE] === 0) {
      this.stroke_to(surface, x, y, 0.0, 90.0, 0.0, dtime - 0.0001);
      dtime = 0.0001;
    }
    if (this.settings[constants.BRUSH_TRACKING_NOISE].base_value) {
      base_radius = Math.exp(this.settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value);
      x += rand_gauss() * this.settings[constants.BRUSH_TRACKING_NOISE].base_value * base_radius;
      y += rand_gauss() * this.settings[constants.BRUSH_TRACKING_NOISE].base_value * base_radius;
    }
    fac = 1.0 - this.exp_decay(this.settings[constants.BRUSH_SLOW_TRACKING].base_value, 100.0 * dtime);
    x = this.states[constants.STATE_X] + (x - this.states[constants.STATE_X]) * fac;
    y = this.states[constants.STATE_Y] + (y - this.states[constants.STATE_Y]) * fac;
    dist_moved = this.states[constants.STATE_DIST];
    dist_todo = this.count_dabs_to(x, y, pressure, dtime);
    if (dtime > 5) {
      i = 0;
      while (i < constants.STATE_COUNT) {
        this.states[i] = 0;
        i++;
      }
      this.states[constants.STATE_X] = x;
      this.states[constants.STATE_Y] = y;
      this.states[constants.STATE_PRESSURE] = pressure;
      this.states[constants.STATE_ACTUAL_X] = this.states[constants.STATE_X];
      this.states[constants.STATE_ACTUAL_Y] = this.states[constants.STATE_Y];
      this.states[constants.STATE_STROKE] = 1.0;
    }
    UNKNOWN = 0;
    YES = 1;
    NO = 2;
    painted = UNKNOWN;
    dtime_left = dtime;
    step_dx = void 0;
    step_dy = void 0;
    step_dpressure = void 0;
    step_dtime = void 0;
    step_declination = void 0;
    step_ascension = void 0;
    while (dist_moved + dist_todo >= 1.0) {
      frac = void 0;
      if (dist_moved > 0) {
        frac = (1.0 - dist_moved) / dist_todo;
        dist_moved = 0;
      } else {
        frac = 1.0 / dist_todo;
      }
      step_dx = frac * (x - this.states[constants.STATE_X]);
      step_dy = frac * (y - this.states[constants.STATE_Y]);
      step_dpressure = frac * (pressure - this.states[constants.STATE_PRESSURE]);
      step_dtime = frac * (dtime_left - 0.0);
      step_declination = frac * (tilt_declination - this.states[constants.STATE_DECLINATION]);
      step_ascension = frac * (tilt_ascension - this.states[constants.STATE_ASCENSION]);
      this.update_states_and_setting_values(step_dx, step_dy, step_dpressure, step_declination, step_ascension, step_dtime);
      painted_now = this.prepare_and_draw_dab(surface);
      if (painted_now) {
        painted = YES;
      } else {
        if (painted === UNKNOWN) {
          painted = NO;
        }
      }
      dtime_left -= step_dtime;
      dist_todo = this.count_dabs_to(x, y, pressure, dtime_left);
    }
    step_dx = x - this.states[constants.STATE_X];
    step_dy = y - this.states[constants.STATE_Y];
    step_dpressure = pressure - this.states[constants.STATE_PRESSURE];
    step_declination = tilt_declination - this.states[constants.STATE_DECLINATION];
    step_ascension = tilt_ascension - this.states[constants.STATE_ASCENSION];
    step_dtime = dtime_left;
    this.update_states_and_setting_values(step_dx, step_dy, step_dpressure, step_declination, step_ascension, step_dtime);
    this.states[constants.STATE_DIST] = dist_moved + dist_todo;
    if (painted === UNKNOWN) {
      if (this.stroke_current_idling_time > 0 || this.stroke_total_painting_time === 0) {
        painted = NO;
      } else {
        painted = YES;
      }
    }
    if (painted === YES) {
      this.stroke_total_painting_time += dtime;
      this.stroke_current_idling_time = 0;
      if (this.stroke_total_painting_time > 4 + 3 * pressure) {
        if (step_dpressure >= 0) {
          return true;
        }
      }
    } else if (painted === NO) {
      this.stroke_current_idling_time += dtime;
      if (this.stroke_total_painting_time === 0) {
        if (this.stroke_current_idling_time > 1.0) {
          return true;
        }
      } else {
        if (this.stroke_total_painting_time + this.stroke_current_idling_time > 1.2 + 5 * pressure) {
          return true;
        }
      }
    }
    return false;
  };

  return Brush;

})();

module.exports = Brush;

},{"./Mapping":8,"./constants":9,"./math":10,"onecolor":12}],5:[function(require,module,exports){
var CanvasSurface, findPos;

findPos = require('./utils').findPos;

CanvasSurface = (function() {
  function CanvasSurface(canvas) {
    this.canvas = canvas;
    this.r = 0;
    this.g = 0;
    this.b = 0;
    this.dab_count = 0;
    this.getcolor_count = 0;
    this.context = this.canvas.getContext("2d");
    this.context.fillStyle = "rgba(255,255,255,255)";
    this.context.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.pos = findPos(this.canvas);
  }

  CanvasSurface.prototype.draw_dab = function(x, y, radius, color_r, color_g, color_b, opaque, hardness, alpha_eraser, aspect_ratio, angle) {
    var bb, g1, gg, height, rr, width;
    if (opaque === 0) {
      return;
    }
    this.dab_count++;
    height = (radius * 2) / aspect_ratio;
    width = radius * 2 * 1.3;
    this.context.beginPath();
    this.context.save();
    rr = Math.floor(color_r * 256);
    gg = Math.floor(color_g * 256);
    bb = Math.floor(color_b * 256);
    this.context.translate(x, y);
    if (hardness < 1) {
      g1 = this.context.createRadialGradient(0, 0, 0, 0, 0, radius);
      g1.addColorStop(hardness, "rgba(" + rr + "," + gg + "," + bb + "," + opaque + ")");
      g1.addColorStop(1, "rgba(" + rr + "," + gg + "," + bb + ",0)");
    } else {
      g1 = "rgba(" + rr + "," + gg + "," + bb + "," + opaque + ")";
    }
    this.context.rotate(90 + angle);
    this.context.moveTo(0, -height / 2);
    this.context.bezierCurveTo(width / 2, -height / 2, width / 2, height / 2, 0, height / 2);
    this.context.bezierCurveTo(-width / 2, height / 2, -width / 2, -height / 2, 0, -height / 2);
    this.context.fillStyle = g1;
    this.context.fill();
    this.context.restore();
    return this.context.closePath();
  };

  CanvasSurface.prototype.get_color = function(x, y, radius) {
    var imgd, pix;
    this.getcolor_count++;
    imgd = this.context.getImageData(x, y, 1, 1);
    pix = imgd.data;
    this.r = pix[0] / 255;
    this.g = pix[1] / 255;
    this.b = pix[2] / 255;
    return this.a = pix[3] / 255;
  };

  return CanvasSurface;

})();

module.exports = CanvasSurface;

},{"./utils":11}],6:[function(require,module,exports){
var ControlPoints;

ControlPoints = (function() {
  function ControlPoints() {
    this.xvalues = new Array(8);
    this.yvalues = new Array(8);
    this.n = 0;
  }

  return ControlPoints;

})();

module.exports = ControlPoints;

},{}],7:[function(require,module,exports){
var Controls,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

Controls = (function() {
  function Controls(surface, brush) {
    this.surface = surface;
    this.brush = brush;
    this.mousedrag = __bind(this.mousedrag, this);
    this.mouseup = __bind(this.mouseup, this);
    this.mousedown = __bind(this.mousedown, this);
    this.t1 = null;
    this.canvas = this.surface.canvas;
    this.canvasPos = this.surface.pos;
    this.iPad = navigator.userAgent.match(/iPad/i) !== null;
    this.lastX = 0;
    this.lastY = 0;
    this.canvas.addEventListener("mousedrag", this.mousedrag);
    this.canvas.addEventListener("mousedown", this.mousedown);
    this.canvas.addEventListener("mouseup", this.mouseup);
    this.canvas.addEventListener("touchmove", this.mousedrag, false);
    this.canvas.addEventListener("touchstart", this.mousedown, false);
    this.canvas.addEventListener("touchend", this.mouseup, false);
  }

  Controls.prototype.setBrush = function(brush) {
    return this.brush = brush;
  };

  Controls.prototype.mousedown = function(evt) {
    var te;
    if (this.iPad) {
      te = evt.touches.item(0);
      this.lastX = te.clientX - this.canvasPos.x;
      this.lastY = te.clientY - this.canvasPos.y;
      this.canvas.touchmove = this.mousedrag;
    } else {
      this.canvas.onmousemove = this.mousedrag;
      this.lastX = evt.clientX - this.canvasPos.x;
      this.lastY = evt.clientY - this.canvasPos.y;
    }
    this.t1 = (new Date()).getTime();
    this.brush.new_stroke(this.lastX, this.lastY);
    return this.mousedrag(evt);
  };

  Controls.prototype.mouseup = function(evt) {
    return this.canvas.onmousemove = null;
  };

  Controls.prototype.mousedrag = function(evt) {
    var curX, curY, isEraser, mousepressure, plugin, pressure, te;
    plugin = document.embeds["wacom-plugin"];
    curX = 0;
    curY = 0;
    pressure = void 0;
    isEraser = void 0;
    mousepressure = document.getElementById("mousepressure").value;
    if (plugin) {
      pressure = plugin.pressure;
      isEraser = plugin.isEraser;
      if (isEraser == null) {
        isEraser = false;
      }
      if ((pressure == null) || pressure === 0) {
        pressure = mousepressure / 100;
      }
    } else {
      pressure = pressure = mousepressure / 100;
      isEraser = false;
    }
    if (this.iPad) {
      te = evt.touches.item(0);
      curX = te.clientX - this.canvasPos.x;
      curY = te.clientY - this.canvasPos.y;
      evt.preventDefault();
      pressure = mousepressure / 100;
      isEraser = false;
    } else {
      curX = evt.clientX - this.canvasPos.x;
      curY = evt.clientY - this.canvasPos.y;
    }
    this.brush.stroke_to(this.surface, curX, curY, pressure, 90, 0, ((new Date()).getTime() - this.t1) / 1000);
    this.lastX = curX;
    return this.lastY = curY;
  };

  return Controls;

})();

module.exports = Controls;

},{}],8:[function(require,module,exports){
var ControlPoints, Mapping, assert;

ControlPoints = require('./ControlPoints');

assert = require('./utils').assert;

Mapping = (function() {
  function Mapping(inputcount) {
    var i;
    this.inputs = inputcount;
    this.inputs_used = 0;
    this.pointsList = new Array(inputcount);
    i = 0;
    while (i < inputcount) {
      this.pointsList[i] = new ControlPoints();
      i++;
    }
    this.base_value = 0;
  }

  Mapping.prototype.set_n = function(input, n) {
    var p;
    p = this.pointsList[input];
    if (n !== 0 && p.n === 0) {
      inputs_used++;
    }
    if (n === 0 && p.n !== 0) {
      inputs_used--;
    }
    return p.n = n;
  };

  Mapping.prototype.set_point = function(input, index, x, y) {
    var p;
    p = this.pointsList[input];
    if (index > 0) {
      assert(x >= p.xvalues[index - 1], " x must > p->xvalues[index-1]");
    }
    p.xvalues[index] = x;
    return p.yvalues[index] = y;
  };

  Mapping.prototype.is_constant = function() {
    return this.inputs_used === 0;
  };

  Mapping.prototype.calculate = function(data) {
    var i, j, p, result, x, x0, x1, y, y0, y1;
    result = this.base_value;
    if (this.inputs_used === 0) {
      return result;
    }
    j = 0;
    while (j < this.inputs) {
      p = this.pointsList[j];
      if (p.n) {
        y = void 0;
        x = data[j];
        x0 = p.xvalues[0];
        y0 = p.yvalues[0];
        x1 = p.xvalues[1];
        y1 = p.yvalues[1];
        i = 2;
        while (i < p.n && x > x1) {
          x0 = x1;
          y0 = y1;
          x1 = p.xvalues[i];
          y1 = p.yvalues[i];
          i++;
        }
        if (x0 === x1) {
          y = y0;
        } else {
          y = (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0);
        }
        result += y;
      }
      j++;
    }
    return result;
  };

  return Mapping;

})();

module.exports = Mapping;

},{"./ControlPoints":6,"./utils":11}],9:[function(require,module,exports){
var constants;

constants = {
  ACTUAL_RADIUS_MIN: 0.2,
  ACTUAL_RADIUS_MAX: 800,
  INPUT_PRESSURE: 0,
  INPUT_SPEED1: 1,
  INPUT_SPEED2: 2,
  INPUT_RANDOM: 3,
  INPUT_STROKE: 4,
  INPUT_DIRECTION: 5,
  INPUT_TILT_DECLINATION: 6,
  INPUT_TILT_ASCENSION: 7,
  INPUT_CUSTOM: 8,
  INPUT_COUNT: 9,
  BRUSH_OPAQUE: 0,
  BRUSH_OPAQUE_MULTIPLY: 1,
  BRUSH_OPAQUE_LINEARIZE: 2,
  BRUSH_RADIUS_LOGARITHMIC: 3,
  BRUSH_HARDNESS: 4,
  BRUSH_DABS_PER_BASIC_RADIUS: 5,
  BRUSH_DABS_PER_ACTUAL_RADIUS: 6,
  BRUSH_DABS_PER_SECOND: 7,
  BRUSH_RADIUS_BY_RANDOM: 8,
  BRUSH_SPEED1_SLOWNESS: 9,
  BRUSH_SPEED2_SLOWNESS: 10,
  BRUSH_SPEED1_GAMMA: 11,
  BRUSH_SPEED2_GAMMA: 12,
  BRUSH_OFFSET_BY_RANDOM: 13,
  BRUSH_OFFSET_BY_SPEED: 14,
  BRUSH_OFFSET_BY_SPEED_SLOWNESS: 15,
  BRUSH_SLOW_TRACKING: 16,
  BRUSH_SLOW_TRACKING_PER_DAB: 17,
  BRUSH_TRACKING_NOISE: 18,
  BRUSH_COLOR_HUE: 19,
  BRUSH_COLOR_H: 19,
  BRUSH_COLOR_SATURATION: 20,
  BRUSH_COLOR_S: 20,
  BRUSH_COLOR_VALUE: 21,
  BRUSH_COLOR_V: 21,
  BRUSH_CHANGE_COLOR_H: 22,
  BRUSH_CHANGE_COLOR_L: 23,
  BRUSH_CHANGE_COLOR_HSL_S: 24,
  BRUSH_CHANGE_COLOR_V: 25,
  BRUSH_CHANGE_COLOR_HSV_S: 26,
  BRUSH_SMUDGE: 27,
  BRUSH_SMUDGE_LENGTH: 28,
  BRUSH_SMUDGE_RADIUS_LOG: 29,
  BRUSH_ERASER: 30,
  BRUSH_STROKE_TRESHOLD: 31,
  BRUSH_STROKE_THRESHOLD: 31,
  BRUSH_STROKE_DURATION_LOGARITHMIC: 32,
  BRUSH_STROKE_HOLDTIME: 33,
  BRUSH_CUSTOM_INPUT: 34,
  BRUSH_CUSTOM_INPUT_SLOWNESS: 35,
  BRUSH_ELLIPTICAL_DAB_RATIO: 36,
  BRUSH_ELLIPTICAL_DAB_ANGLE: 37,
  BRUSH_DIRECTION_FILTER: 38,
  BRUSH_VERSION: 39,
  BRUSH_SETTINGS_COUNT: 40,
  BRUSH_ADAPT_COLOR_FROM_IMAGE: 1000,
  BRUSH_CHANGE_RADIUS: 1000,
  BRUSH_GROUP: 1000,
  STATE_X: 0,
  STATE_Y: 1,
  STATE_PRESSURE: 2,
  STATE_DIST: 3,
  STATE_ACTUAL_RADIUS: 4,
  STATE_SMUDGE_RA: 5,
  STATE_SMUDGE_GA: 6,
  STATE_SMUDGE_BA: 7,
  STATE_SMUDGE_A: 8,
  STATE_ACTUAL_X: 9,
  STATE_ACTUAL_Y: 10,
  STATE_NORM_DX_SLOW: 11,
  STATE_NORM_DY_SLOW: 12,
  STATE_NORM_SPEED1_SLOW: 13,
  STATE_NORM_SPEED2_SLOW: 14,
  STATE_STROKE: 15,
  STATE_STROKE_STARTED: 16,
  STATE_CUSTOM_INPUT: 17,
  STATE_RNG_SEED: 18,
  STATE_ACTUAL_ELLIPTICAL_DAB_RATIO: 19,
  STATE_ACTUAL_ELLIPTICAL_DAB_ANGLE: 20,
  STATE_DIRECTION_DX: 21,
  STATE_DIRECTION_DY: 22,
  STATE_DECLINATION: 23,
  STATE_ASCENSION: 24,
  STATE_COUNT: 25
};

module.exports = constants;

},{}],10:[function(require,module,exports){
var math;

math = {
  hypotf: function(a, b) {
    return Math.sqrt(a * a + b * b);
  },
  hypot: function(a, b) {
    return Math.sqrt(a * a + b * b);
  },
  clamp: function(v, min, max) {
    if (v > max) {
      return max;
    } else if (v < min) {
      return min;
    } else {
      return v;
    }
  },
  fmodf: function(a, b) {
    return Math.floor(((a / b) % 1.0) * b);
  },
  rand_gauss: function() {
    var rand1, rand2, sum;
    sum = 0.0;
    rand1 = Math.ceil(Math.random() * 0x7ffffff);
    rand2 = Math.ceil(Math.random() * 0x7ffffff);
    sum += rand1 & 0x7fff;
    sum += (rand1 >> 16) & 0x7fff;
    sum += rand2 & 0x7fff;
    sum += (rand2 >> 16) & 0x7fff;
    return sum * 5.28596089837e-5 - 3.46410161514;
  },
  max3: function(a, b, c) {
    if (a > b) {
      return Math.max(a, c);
    } else {
      return Math.max(b, c);
    }
  },
  min3: function(a, b, c) {
    if (a < b) {
      return Math.min(a, c);
    } else {
      return Math.min(b, c);
    }
  }
};

module.exports = math;

},{}],11:[function(require,module,exports){
var AssertException, utils;

AssertException = require("./AssertException");

utils = {
  assert: function(exp, message) {
    if (!exp) {
      throw new AssertException(message);
    }
  },
  findPos: function(obj) {
    var curleft, curtop;
    curleft = curtop = 0;
    if (obj.offsetParent) {
      curleft = obj.offsetLeft;
      curtop = obj.offsetTop;
      while (obj = obj.offsetParent) {
        curleft += obj.offsetLeft;
        curtop += obj.offsetTop;
      }
    }
    return {
      x: curleft,
      y: curtop
    };
  }
};

module.exports = utils;

},{"./AssertException":3}],12:[function(require,module,exports){
/*jshint evil:true, onevar:false*/
/*global define*/
var installedColorSpaces = [],
    namedColors = {},
    undef = function (obj) {
        return typeof obj === 'undefined';
    },
    channelRegExp = /\s*(\.\d+|\d+(?:\.\d+)?)(%)?\s*/,
    alphaChannelRegExp = /\s*(\.\d+|\d+(?:\.\d+)?)\s*/,
    cssColorRegExp = new RegExp(
                         "^(rgb|hsl|hsv)a?" +
                         "\\(" +
                             channelRegExp.source + "," +
                             channelRegExp.source + "," +
                             channelRegExp.source +
                             "(?:," + alphaChannelRegExp.source + ")?" +
                         "\\)$", "i");

function ONECOLOR(obj) {
    if (Object.prototype.toString.apply(obj) === '[object Array]') {
        if (typeof obj[0] === 'string' && typeof ONECOLOR[obj[0]] === 'function') {
            // Assumed array from .toJSON()
            return new ONECOLOR[obj[0]](obj.slice(1, obj.length));
        } else if (obj.length === 4) {
            // Assumed 4 element int RGB array from canvas with all channels [0;255]
            return new ONECOLOR.RGB(obj[0] / 255, obj[1] / 255, obj[2] / 255, obj[3] / 255);
        }
    } else if (typeof obj === 'string') {
        var lowerCased = obj.toLowerCase();
        if (namedColors[lowerCased]) {
            obj = '#' + namedColors[lowerCased];
        }
        if (lowerCased === 'transparent') {
            obj = 'rgba(0,0,0,0)';
        }
        // Test for CSS rgb(....) string
        var matchCssSyntax = obj.match(cssColorRegExp);
        if (matchCssSyntax) {
            var colorSpaceName = matchCssSyntax[1].toUpperCase(),
                alpha = undef(matchCssSyntax[8]) ? matchCssSyntax[8] : parseFloat(matchCssSyntax[8]),
                hasHue = colorSpaceName[0] === 'H',
                firstChannelDivisor = matchCssSyntax[3] ? 100 : (hasHue ? 360 : 255),
                secondChannelDivisor = (matchCssSyntax[5] || hasHue) ? 100 : 255,
                thirdChannelDivisor = (matchCssSyntax[7] || hasHue) ? 100 : 255;
            if (undef(ONECOLOR[colorSpaceName])) {
                throw new Error("one.color." + colorSpaceName + " is not installed.");
            }
            return new ONECOLOR[colorSpaceName](
                parseFloat(matchCssSyntax[2]) / firstChannelDivisor,
                parseFloat(matchCssSyntax[4]) / secondChannelDivisor,
                parseFloat(matchCssSyntax[6]) / thirdChannelDivisor,
                alpha
            );
        }
        // Assume hex syntax
        if (obj.length < 6) {
            // Allow CSS shorthand
            obj = obj.replace(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i, '$1$1$2$2$3$3');
        }
        // Split obj into red, green, and blue components
        var hexMatch = obj.match(/^#?([0-9a-f][0-9a-f])([0-9a-f][0-9a-f])([0-9a-f][0-9a-f])$/i);
        if (hexMatch) {
            return new ONECOLOR.RGB(
                parseInt(hexMatch[1], 16) / 255,
                parseInt(hexMatch[2], 16) / 255,
                parseInt(hexMatch[3], 16) / 255
            );
        }
    } else if (typeof obj === 'object' && obj.isColor) {
        return obj;
    }
    return false;
}

function installColorSpace(colorSpaceName, propertyNames, config) {
    ONECOLOR[colorSpaceName] = new Function(propertyNames.join(","),
        // Allow passing an array to the constructor:
        "if (Object.prototype.toString.apply(" + propertyNames[0] + ") === '[object Array]') {" +
            propertyNames.map(function (propertyName, i) {
                return propertyName + "=" + propertyNames[0] + "[" + i + "];";
            }).reverse().join("") +
        "}" +
        "if (" + propertyNames.filter(function (propertyName) {
            return propertyName !== 'alpha';
        }).map(function (propertyName) {
            return "isNaN(" + propertyName + ")";
        }).join("||") + "){" + "throw new Error(\"[" + colorSpaceName + "]: Invalid color: (\"+" + propertyNames.join("+\",\"+") + "+\")\");}" +
        propertyNames.map(function (propertyName) {
            if (propertyName === 'hue') {
                return "this._hue=hue<0?hue-Math.floor(hue):hue%1"; // Wrap
            } else if (propertyName === 'alpha') {
                return "this._alpha=(isNaN(alpha)||alpha>1)?1:(alpha<0?0:alpha);";
            } else {
                return "this._" + propertyName + "=" + propertyName + "<0?0:(" + propertyName + ">1?1:" + propertyName + ")";
            }
        }).join(";") + ";"
    );
    ONECOLOR[colorSpaceName].propertyNames = propertyNames;

    var prototype = ONECOLOR[colorSpaceName].prototype;

    ['valueOf', 'hex', 'hexa', 'css', 'cssa'].forEach(function (methodName) {
        prototype[methodName] = prototype[methodName] || (colorSpaceName === 'RGB' ? prototype.hex : new Function("return this.rgb()." + methodName + "();"));
    });

    prototype.isColor = true;

    prototype.equals = function (otherColor, epsilon) {
        if (undef(epsilon)) {
            epsilon = 1e-10;
        }

        otherColor = otherColor[colorSpaceName.toLowerCase()]();

        for (var i = 0; i < propertyNames.length; i = i + 1) {
            if (Math.abs(this['_' + propertyNames[i]] - otherColor['_' + propertyNames[i]]) > epsilon) {
                return false;
            }
        }

        return true;
    };

    prototype.toJSON = new Function(
        "return ['" + colorSpaceName + "', " +
            propertyNames.map(function (propertyName) {
                return "this._" + propertyName;
            }, this).join(", ") +
        "];"
    );

    for (var propertyName in config) {
        if (config.hasOwnProperty(propertyName)) {
            var matchFromColorSpace = propertyName.match(/^from(.*)$/);
            if (matchFromColorSpace) {
                ONECOLOR[matchFromColorSpace[1].toUpperCase()].prototype[colorSpaceName.toLowerCase()] = config[propertyName];
            } else {
                prototype[propertyName] = config[propertyName];
            }
        }
    }

    // It is pretty easy to implement the conversion to the same color space:
    prototype[colorSpaceName.toLowerCase()] = function () {
        return this;
    };
    prototype.toString = new Function("return \"[one.color." + colorSpaceName + ":\"+" + propertyNames.map(function (propertyName, i) {
        return "\" " + propertyNames[i] + "=\"+this._" + propertyName;
    }).join("+") + "+\"]\";");

    // Generate getters and setters
    propertyNames.forEach(function (propertyName, i) {
        prototype[propertyName] = prototype[propertyName === 'black' ? 'k' : propertyName[0]] = new Function("value", "isDelta",
            // Simple getter mode: color.red()
            "if (typeof value === 'undefined') {" +
                "return this._" + propertyName + ";" +
            "}" +
            // Adjuster: color.red(+.2, true)
            "if (isDelta) {" +
                "return new this.constructor(" + propertyNames.map(function (otherPropertyName, i) {
                    return "this._" + otherPropertyName + (propertyName === otherPropertyName ? "+value" : "");
                }).join(", ") + ");" +
            "}" +
            // Setter: color.red(.2);
            "return new this.constructor(" + propertyNames.map(function (otherPropertyName, i) {
                return propertyName === otherPropertyName ? "value" : "this._" + otherPropertyName;
            }).join(", ") + ");");
    });

    function installForeignMethods(targetColorSpaceName, sourceColorSpaceName) {
        var obj = {};
        obj[sourceColorSpaceName.toLowerCase()] = new Function("return this.rgb()." + sourceColorSpaceName.toLowerCase() + "();"); // Fallback
        ONECOLOR[sourceColorSpaceName].propertyNames.forEach(function (propertyName, i) {
            obj[propertyName] = obj[propertyName === 'black' ? 'k' : propertyName[0]] = new Function("value", "isDelta", "return this." + sourceColorSpaceName.toLowerCase() + "()." + propertyName + "(value, isDelta);");
        });
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop) && ONECOLOR[targetColorSpaceName].prototype[prop] === undefined) {
                ONECOLOR[targetColorSpaceName].prototype[prop] = obj[prop];
            }
        }
    }

    installedColorSpaces.forEach(function (otherColorSpaceName) {
        installForeignMethods(colorSpaceName, otherColorSpaceName);
        installForeignMethods(otherColorSpaceName, colorSpaceName);
    });

    installedColorSpaces.push(colorSpaceName);
}

ONECOLOR.installMethod = function (name, fn) {
    installedColorSpaces.forEach(function (colorSpace) {
        ONECOLOR[colorSpace].prototype[name] = fn;
    });
};

installColorSpace('RGB', ['red', 'green', 'blue', 'alpha'], {
    hex: function () {
        var hexString = (Math.round(255 * this._red) * 0x10000 + Math.round(255 * this._green) * 0x100 + Math.round(255 * this._blue)).toString(16);
        return '#' + ('00000'.substr(0, 6 - hexString.length)) + hexString;
    },

    hexa: function () {
        var alphaString = Math.round(this._alpha * 255).toString(16);
        return '#' + '00'.substr(0, 2 - alphaString.length) + alphaString + this.hex().substr(1, 6);
    },

    css: function () {
        return "rgb(" + Math.round(255 * this._red) + "," + Math.round(255 * this._green) + "," + Math.round(255 * this._blue) + ")";
    },

    cssa: function () {
        return "rgba(" + Math.round(255 * this._red) + "," + Math.round(255 * this._green) + "," + Math.round(255 * this._blue) + "," + this._alpha + ")";
    }
});
if (typeof define === 'function' && !undef(define.amd)) {
    define(function () {
        return ONECOLOR;
    });
} else if (typeof exports === 'object') {
    // Node module export
    module.exports = ONECOLOR;
} else {
    one = window.one || {};
    one.color = ONECOLOR;
}

if (typeof jQuery !== 'undefined' && undef(jQuery.color)) {
    jQuery.color = ONECOLOR;
}

/*global namedColors*/
namedColors = {
    aliceblue: 'f0f8ff',
    antiquewhite: 'faebd7',
    aqua: '0ff',
    aquamarine: '7fffd4',
    azure: 'f0ffff',
    beige: 'f5f5dc',
    bisque: 'ffe4c4',
    black: '000',
    blanchedalmond: 'ffebcd',
    blue: '00f',
    blueviolet: '8a2be2',
    brown: 'a52a2a',
    burlywood: 'deb887',
    cadetblue: '5f9ea0',
    chartreuse: '7fff00',
    chocolate: 'd2691e',
    coral: 'ff7f50',
    cornflowerblue: '6495ed',
    cornsilk: 'fff8dc',
    crimson: 'dc143c',
    cyan: '0ff',
    darkblue: '00008b',
    darkcyan: '008b8b',
    darkgoldenrod: 'b8860b',
    darkgray: 'a9a9a9',
    darkgrey: 'a9a9a9',
    darkgreen: '006400',
    darkkhaki: 'bdb76b',
    darkmagenta: '8b008b',
    darkolivegreen: '556b2f',
    darkorange: 'ff8c00',
    darkorchid: '9932cc',
    darkred: '8b0000',
    darksalmon: 'e9967a',
    darkseagreen: '8fbc8f',
    darkslateblue: '483d8b',
    darkslategray: '2f4f4f',
    darkslategrey: '2f4f4f',
    darkturquoise: '00ced1',
    darkviolet: '9400d3',
    deeppink: 'ff1493',
    deepskyblue: '00bfff',
    dimgray: '696969',
    dimgrey: '696969',
    dodgerblue: '1e90ff',
    firebrick: 'b22222',
    floralwhite: 'fffaf0',
    forestgreen: '228b22',
    fuchsia: 'f0f',
    gainsboro: 'dcdcdc',
    ghostwhite: 'f8f8ff',
    gold: 'ffd700',
    goldenrod: 'daa520',
    gray: '808080',
    grey: '808080',
    green: '008000',
    greenyellow: 'adff2f',
    honeydew: 'f0fff0',
    hotpink: 'ff69b4',
    indianred: 'cd5c5c',
    indigo: '4b0082',
    ivory: 'fffff0',
    khaki: 'f0e68c',
    lavender: 'e6e6fa',
    lavenderblush: 'fff0f5',
    lawngreen: '7cfc00',
    lemonchiffon: 'fffacd',
    lightblue: 'add8e6',
    lightcoral: 'f08080',
    lightcyan: 'e0ffff',
    lightgoldenrodyellow: 'fafad2',
    lightgray: 'd3d3d3',
    lightgrey: 'd3d3d3',
    lightgreen: '90ee90',
    lightpink: 'ffb6c1',
    lightsalmon: 'ffa07a',
    lightseagreen: '20b2aa',
    lightskyblue: '87cefa',
    lightslategray: '789',
    lightslategrey: '789',
    lightsteelblue: 'b0c4de',
    lightyellow: 'ffffe0',
    lime: '0f0',
    limegreen: '32cd32',
    linen: 'faf0e6',
    magenta: 'f0f',
    maroon: '800000',
    mediumaquamarine: '66cdaa',
    mediumblue: '0000cd',
    mediumorchid: 'ba55d3',
    mediumpurple: '9370d8',
    mediumseagreen: '3cb371',
    mediumslateblue: '7b68ee',
    mediumspringgreen: '00fa9a',
    mediumturquoise: '48d1cc',
    mediumvioletred: 'c71585',
    midnightblue: '191970',
    mintcream: 'f5fffa',
    mistyrose: 'ffe4e1',
    moccasin: 'ffe4b5',
    navajowhite: 'ffdead',
    navy: '000080',
    oldlace: 'fdf5e6',
    olive: '808000',
    olivedrab: '6b8e23',
    orange: 'ffa500',
    orangered: 'ff4500',
    orchid: 'da70d6',
    palegoldenrod: 'eee8aa',
    palegreen: '98fb98',
    paleturquoise: 'afeeee',
    palevioletred: 'd87093',
    papayawhip: 'ffefd5',
    peachpuff: 'ffdab9',
    peru: 'cd853f',
    pink: 'ffc0cb',
    plum: 'dda0dd',
    powderblue: 'b0e0e6',
    purple: '800080',
    rebeccapurple: '639',
    red: 'f00',
    rosybrown: 'bc8f8f',
    royalblue: '4169e1',
    saddlebrown: '8b4513',
    salmon: 'fa8072',
    sandybrown: 'f4a460',
    seagreen: '2e8b57',
    seashell: 'fff5ee',
    sienna: 'a0522d',
    silver: 'c0c0c0',
    skyblue: '87ceeb',
    slateblue: '6a5acd',
    slategray: '708090',
    slategrey: '708090',
    snow: 'fffafa',
    springgreen: '00ff7f',
    steelblue: '4682b4',
    tan: 'd2b48c',
    teal: '008080',
    thistle: 'd8bfd8',
    tomato: 'ff6347',
    turquoise: '40e0d0',
    violet: 'ee82ee',
    wheat: 'f5deb3',
    white: 'fff',
    whitesmoke: 'f5f5f5',
    yellow: 'ff0',
    yellowgreen: '9acd32'
};

/*global INCLUDE, installColorSpace, ONECOLOR*/

installColorSpace('XYZ', ['x', 'y', 'z', 'alpha'], {
    fromRgb: function () {
        // http://www.easyrgb.com/index.php?X=MATH&H=02#text2
        var convert = function (channel) {
                return channel > 0.04045 ?
                    Math.pow((channel + 0.055) / 1.055, 2.4) :
                    channel / 12.92;
            },
            r = convert(this._red),
            g = convert(this._green),
            b = convert(this._blue);

        // Reference white point sRGB D65:
        // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
        return new ONECOLOR.XYZ(
            r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
            r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
            r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
            this._alpha
        );
    },

    rgb: function () {
        // http://www.easyrgb.com/index.php?X=MATH&H=01#text1
        var x = this._x,
            y = this._y,
            z = this._z,
            convert = function (channel) {
                return channel > 0.0031308 ?
                    1.055 * Math.pow(channel, 1 / 2.4) - 0.055 :
                    12.92 * channel;
            };

        // Reference white point sRGB D65:
        // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
        return new ONECOLOR.RGB(
            convert(x *  3.2404542 + y * -1.5371385 + z * -0.4985314),
            convert(x * -0.9692660 + y *  1.8760108 + z *  0.0415560),
            convert(x *  0.0556434 + y * -0.2040259 + z *  1.0572252),
            this._alpha
        );
    },

    lab: function () {
        // http://www.easyrgb.com/index.php?X=MATH&H=07#text7
        var convert = function (channel) {
                return channel > 0.008856 ?
                    Math.pow(channel, 1 / 3) :
                    7.787037 * channel + 4 / 29;
            },
            x = convert(this._x /  95.047),
            y = convert(this._y / 100.000),
            z = convert(this._z / 108.883);

        return new ONECOLOR.LAB(
            (116 * y) - 16,
            500 * (x - y),
            200 * (y - z),
            this._alpha
        );
    }
});

/*global INCLUDE, installColorSpace, ONECOLOR*/

installColorSpace('LAB', ['l', 'a', 'b', 'alpha'], {
    fromRgb: function () {
        return this.xyz().lab();
    },

    rgb: function () {
        return this.xyz().rgb();
    },

    xyz: function () {
        // http://www.easyrgb.com/index.php?X=MATH&H=08#text8
        var convert = function (channel) {
                var pow = Math.pow(channel, 3);
                return pow > 0.008856 ?
                    pow :
                    (channel - 16 / 116) / 7.87;
            },
            y = (this._l + 16) / 116,
            x = this._a / 500 + y,
            z = y - this._b / 200;

        return new ONECOLOR.XYZ(
            convert(x) *  95.047,
            convert(y) * 100.000,
            convert(z) * 108.883,
            this._alpha
        );
    }
});

/*global one*/

installColorSpace('HSV', ['hue', 'saturation', 'value', 'alpha'], {
    rgb: function () {
        var hue = this._hue,
            saturation = this._saturation,
            value = this._value,
            i = Math.min(5, Math.floor(hue * 6)),
            f = hue * 6 - i,
            p = value * (1 - saturation),
            q = value * (1 - f * saturation),
            t = value * (1 - (1 - f) * saturation),
            red,
            green,
            blue;
        switch (i) {
        case 0:
            red = value;
            green = t;
            blue = p;
            break;
        case 1:
            red = q;
            green = value;
            blue = p;
            break;
        case 2:
            red = p;
            green = value;
            blue = t;
            break;
        case 3:
            red = p;
            green = q;
            blue = value;
            break;
        case 4:
            red = t;
            green = p;
            blue = value;
            break;
        case 5:
            red = value;
            green = p;
            blue = q;
            break;
        }
        return new ONECOLOR.RGB(red, green, blue, this._alpha);
    },

    hsl: function () {
        var l = (2 - this._saturation) * this._value,
            sv = this._saturation * this._value,
            svDivisor = l <= 1 ? l : (2 - l),
            saturation;

        // Avoid division by zero when lightness approaches zero:
        if (svDivisor < 1e-9) {
            saturation = 0;
        } else {
            saturation = sv / svDivisor;
        }
        return new ONECOLOR.HSL(this._hue, saturation, l / 2, this._alpha);
    },

    fromRgb: function () { // Becomes one.color.RGB.prototype.hsv
        var red = this._red,
            green = this._green,
            blue = this._blue,
            max = Math.max(red, green, blue),
            min = Math.min(red, green, blue),
            delta = max - min,
            hue,
            saturation = (max === 0) ? 0 : (delta / max),
            value = max;
        if (delta === 0) {
            hue = 0;
        } else {
            switch (max) {
            case red:
                hue = (green - blue) / delta / 6 + (green < blue ? 1 : 0);
                break;
            case green:
                hue = (blue - red) / delta / 6 + 1 / 3;
                break;
            case blue:
                hue = (red - green) / delta / 6 + 2 / 3;
                break;
            }
        }
        return new ONECOLOR.HSV(hue, saturation, value, this._alpha);
    }
});

/*global one*/


installColorSpace('HSL', ['hue', 'saturation', 'lightness', 'alpha'], {
    hsv: function () {
        // Algorithm adapted from http://wiki.secondlife.com/wiki/Color_conversion_scripts
        var l = this._lightness * 2,
            s = this._saturation * ((l <= 1) ? l : 2 - l),
            saturation;

        // Avoid division by zero when l + s is very small (approaching black):
        if (l + s < 1e-9) {
            saturation = 0;
        } else {
            saturation = (2 * s) / (l + s);
        }

        return new ONECOLOR.HSV(this._hue, saturation, (l + s) / 2, this._alpha);
    },

    rgb: function () {
        return this.hsv().rgb();
    },

    fromRgb: function () { // Becomes one.color.RGB.prototype.hsv
        return this.hsv().hsl();
    }
});

/*global one*/

installColorSpace('CMYK', ['cyan', 'magenta', 'yellow', 'black', 'alpha'], {
    rgb: function () {
        return new ONECOLOR.RGB((1 - this._cyan * (1 - this._black) - this._black),
                                 (1 - this._magenta * (1 - this._black) - this._black),
                                 (1 - this._yellow * (1 - this._black) - this._black),
                                 this._alpha);
    },

    fromRgb: function () { // Becomes one.color.RGB.prototype.cmyk
        // Adapted from http://www.javascripter.net/faq/rgb2cmyk.htm
        var red = this._red,
            green = this._green,
            blue = this._blue,
            cyan = 1 - red,
            magenta = 1 - green,
            yellow = 1 - blue,
            black = 1;
        if (red || green || blue) {
            black = Math.min(cyan, Math.min(magenta, yellow));
            cyan = (cyan - black) / (1 - black);
            magenta = (magenta - black) / (1 - black);
            yellow = (yellow - black) / (1 - black);
        } else {
            black = 1;
        }
        return new ONECOLOR.CMYK(cyan, magenta, yellow, black, this._alpha);
    }
});

ONECOLOR.installMethod('clearer', function (amount) {
    return this.alpha(isNaN(amount) ? -0.1 : -amount, true);
});


ONECOLOR.installMethod('darken', function (amount) {
    return this.lightness(isNaN(amount) ? -0.1 : -amount, true);
});


ONECOLOR.installMethod('desaturate', function (amount) {
    return this.saturation(isNaN(amount) ? -0.1 : -amount, true);
});

function gs () {
    var rgb = this.rgb(),
        val = rgb._red * 0.3 + rgb._green * 0.59 + rgb._blue * 0.11;

    return new ONECOLOR.RGB(val, val, val, this._alpha);
};

ONECOLOR.installMethod('greyscale', gs);
ONECOLOR.installMethod('grayscale', gs);


ONECOLOR.installMethod('lighten', function (amount) {
    return this.lightness(isNaN(amount) ? 0.1 : amount, true);
});

ONECOLOR.installMethod('mix', function (otherColor, weight) {
    otherColor = ONECOLOR(otherColor).rgb();
    weight = 1 - (isNaN(weight) ? 0.5 : weight);

    var w = weight * 2 - 1,
        a = this._alpha - otherColor._alpha,
        weight1 = (((w * a === -1) ? w : (w + a) / (1 + w * a)) + 1) / 2,
        weight2 = 1 - weight1,
        rgb = this.rgb();

    return new ONECOLOR.RGB(
        rgb._red * weight1 + otherColor._red * weight2,
        rgb._green * weight1 + otherColor._green * weight2,
        rgb._blue * weight1 + otherColor._blue * weight2,
        rgb._alpha * weight + otherColor._alpha * (1 - weight)
    );
});

ONECOLOR.installMethod('negate', function () {
    var rgb = this.rgb();
    return new ONECOLOR.RGB(1 - rgb._red, 1 - rgb._green, 1 - rgb._blue, this._alpha);
});

ONECOLOR.installMethod('opaquer', function (amount) {
    return this.alpha(isNaN(amount) ? 0.1 : amount, true);
});

ONECOLOR.installMethod('rotate', function (degrees) {
    return this.hue((degrees || 0) / 360, true);
});


ONECOLOR.installMethod('saturate', function (amount) {
    return this.saturation(isNaN(amount) ? 0.1 : amount, true);
});

// Adapted from http://gimp.sourcearchive.com/documentation/2.6.6-1ubuntu1/color-to-alpha_8c-source.html
/*
    toAlpha returns a color where the values of the argument have been converted to alpha
*/
ONECOLOR.installMethod('toAlpha', function (color) {
    var me = this.rgb(),
        other = ONECOLOR(color).rgb(),
        epsilon = 1e-10,
        a = new ONECOLOR.RGB(0, 0, 0, me._alpha),
        channels = ['_red', '_green', '_blue'];

    channels.forEach(function (channel) {
        if (me[channel] < epsilon) {
            a[channel] = me[channel];
        } else if (me[channel] > other[channel]) {
            a[channel] = (me[channel] - other[channel]) / (1 - other[channel]);
        } else if (me[channel] > other[channel]) {
            a[channel] = (other[channel] - me[channel]) / other[channel];
        } else {
            a[channel] = 0;
        }
    });

    if (a._red > a._green) {
        if (a._red > a._blue) {
            me._alpha = a._red;
        } else {
            me._alpha = a._blue;
        }
    } else if (a._green > a._blue) {
        me._alpha = a._green;
    } else {
        me._alpha = a._blue;
    }

    if (me._alpha < epsilon) {
        return me;
    }

    channels.forEach(function (channel) {
        me[channel] = (me[channel] - other[channel]) / me._alpha + other[channel];
    });
    me._alpha *= a._alpha;

    return me;
});

/*global one*/

// This file is purely for the build system

// Order is important to prevent channel name clashes. Lab <-> hsL

// Convenience functions


},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsImxpYi9CcnVzaEUuanMiLCJsaWIvYnJ1c2hlL0Fzc2VydEV4Y2VwdGlvbi5qcyIsImxpYi9icnVzaGUvQnJ1c2guanMiLCJsaWIvYnJ1c2hlL0NhbnZhc1N1cmZhY2UuanMiLCJsaWIvYnJ1c2hlL0NvbnRyb2xQb2ludHMuanMiLCJsaWIvYnJ1c2hlL0NvbnRyb2xzLmpzIiwibGliL2JydXNoZS9NYXBwaW5nLmpzIiwibGliL2JydXNoZS9jb25zdGFudHMuanMiLCJsaWIvYnJ1c2hlL21hdGguanMiLCJsaWIvYnJ1c2hlL3V0aWxzLmpzIiwibm9kZV9tb2R1bGVzL29uZWNvbG9yL29uZS1jb2xvci1hbGwtZGVidWcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3aEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vbGliL0JydXNoRS5qcycpO1xuIiwidmFyIEJydXNoLCBCcnVzaEUsIENhbnZhc1N1cmZhY2UsIENvbnRyb2xzO1xuXG5DYW52YXNTdXJmYWNlID0gcmVxdWlyZShcIi4vYnJ1c2hlL0NhbnZhc1N1cmZhY2VcIik7XG5cbkJydXNoID0gcmVxdWlyZShcIi4vYnJ1c2hlL0JydXNoXCIpO1xuXG5Db250cm9scyA9IHJlcXVpcmUoXCIuL2JydXNoZS9Db250cm9sc1wiKTtcblxuQnJ1c2hFID0gKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBCcnVzaEUoY2FudmFzLCBicnVzaCkge1xuICAgIHRoaXMuc3VyZmFjZSA9IG5ldyBDYW52YXNTdXJmYWNlKGNhbnZhcyk7XG4gICAgdGhpcy5icnVzaCA9IG5ldyBCcnVzaChicnVzaCwgdGhpcy5zdXJmYWNlKTtcbiAgICB0aGlzLmNvbnRyb2xzID0gbmV3IENvbnRyb2xzKHRoaXMuc3VyZmFjZSwgdGhpcy5icnVzaCk7XG4gIH1cblxuICBCcnVzaEUucHJvdG90eXBlLnNldEJydXNoID0gZnVuY3Rpb24oYnJ1c2gpIHtcbiAgICB0aGlzLmJydXNoID0gbnVsbDtcbiAgICB0aGlzLmJydXNoID0gbmV3IEJydXNoKGJydXNoLCB0aGlzLnN1cmZhY2UpO1xuICAgIHJldHVybiB0aGlzLmNvbnRyb2xzLnNldEJydXNoKHRoaXMuYnJ1c2gpO1xuICB9O1xuXG4gIHJldHVybiBCcnVzaEU7XG5cbn0pKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gQnJ1c2hFO1xuIiwidmFyIEFzc2VydEV4Y2VwdGlvbjtcblxuQXNzZXJ0RXhjZXB0aW9uID0gKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBBc3NlcnRFeGNlcHRpb24obWVzc2FnZSkge1xuICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gIH1cblxuICBBc3NlcnRFeGNlcHRpb24ucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIFwiQXNzZXJ0RXhjZXB0aW9uOiBcIiArIHRoaXMubWVzc2FnZTtcbiAgfTtcblxuICByZXR1cm4gQXNzZXJ0RXhjZXB0aW9uO1xuXG59KSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFzc2VydEV4Y2VwdGlvbjtcbiIsInZhciBCcnVzaCwgTWFwcGluZywgY2xhbXAsIGNvbG9yLCBjb25zdGFudHMsIGZtb2RmLCBoeXBvdCwgaHlwb3RmLCBtYXRoLCBtYXgzLCBtaW4zLCByYW5kX2dhdXNzO1xuXG5jb2xvciA9IHJlcXVpcmUoJ29uZWNvbG9yJyk7XG5cbmNvbnN0YW50cyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XG5cbk1hcHBpbmcgPSByZXF1aXJlKCcuL01hcHBpbmcnKTtcblxubWF0aCA9IHJlcXVpcmUoJy4vbWF0aCcpO1xuXG5mbW9kZiA9IG1hdGguZm1vZGY7XG5cbmNsYW1wID0gbWF0aC5jbGFtcDtcblxuaHlwb3QgPSBtYXRoLmh5cG90O1xuXG5oeXBvdGYgPSBtYXRoLmh5cG90ZjtcblxucmFuZF9nYXVzcyA9IG1hdGgucmFuZF9nYXVzcztcblxubWF4MyA9IG1hdGgubWF4MztcblxubWluMyA9IG1hdGgubWluMztcblxuQnJ1c2ggPSAoZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIEJydXNoKGJydXNoc2V0dGluZywgc3VyZmFjZSkge1xuICAgIHZhciBpO1xuICAgIHRoaXMuc3VyZmFjZSA9IHN1cmZhY2U7XG4gICAgdGhpcy5zdGF0ZXMgPSBuZXcgQXJyYXkoY29uc3RhbnRzLlNUQVRFX0NPVU5UKTtcbiAgICB0aGlzLnNldHRpbmdzID0gbmV3IEFycmF5KGNvbnN0YW50cy5CUlVTSF9TRVRUSU5HU19DT1VOVCk7XG4gICAgdGhpcy5zZXR0aW5nc192YWx1ZSA9IG5ldyBBcnJheShjb25zdGFudHMuQlJVU0hfU0VUVElOR1NfQ09VTlQpO1xuICAgIHRoaXMuc3BlZWRfbWFwcGluZ19nYW1tYSA9IG5ldyBBcnJheSgyKTtcbiAgICB0aGlzLnNwZWVkX21hcHBpbmdfbSA9IG5ldyBBcnJheSgyKTtcbiAgICB0aGlzLnNwZWVkX21hcHBpbmdfcSA9IG5ldyBBcnJheSgyKTtcbiAgICB0aGlzLnN0cm9rZV9jdXJyZW50X2lkbGluZ190aW1lID0gMDtcbiAgICB0aGlzLnN0cm9rZV90b3RhbF9wYWludGluZ190aW1lID0gMDtcbiAgICBpID0gMDtcbiAgICB3aGlsZSAoaSA8IGNvbnN0YW50cy5CUlVTSF9TRVRUSU5HU19DT1VOVCkge1xuICAgICAgdGhpcy5zZXR0aW5nc1tpXSA9IG5ldyBNYXBwaW5nKGNvbnN0YW50cy5JTlBVVF9DT1VOVCk7XG4gICAgICBpKys7XG4gICAgfVxuICAgIHRoaXMucHJpbnRfaW5wdXRzID0gZmFsc2U7XG4gICAgaSA9IDA7XG4gICAgd2hpbGUgKGkgPCBjb25zdGFudHMuU1RBVEVfQ09VTlQpIHtcbiAgICAgIHRoaXMuc3RhdGVzW2ldID0gMDtcbiAgICAgIGkrKztcbiAgICB9XG4gICAgdGhpcy5yZWFkbXliX2pzb24oYnJ1c2hzZXR0aW5nKTtcbiAgfVxuXG4gIEJydXNoLnByb3RvdHlwZS5yZWFkbXliX2pzb24gPSBmdW5jdGlvbihzZXR0aW5ncykge1xuICAgIHJldHVybiB0aGlzLnNldFNldHRpbmdzKHNldHRpbmdzKTtcbiAgfTtcblxuICBCcnVzaC5wcm90b3R5cGUuc2V0U2V0dGluZ3MgPSBmdW5jdGlvbihzZXR0aW5ncykge1xuICAgIHZhciBpLCBpZHgsIG0sIHByb3AsIHByb3BpZHgsIHNldHRpbmc7XG4gICAgZm9yIChzZXR0aW5nIGluIHNldHRpbmdzKSB7XG4gICAgICBpZHggPSBldmFsKFwiY29uc3RhbnRzLkJSVVNIX1wiICsgc2V0dGluZy50b1VwcGVyQ2FzZSgpKTtcbiAgICAgIGlmIChpZHggPj0gY29uc3RhbnRzLkJSVVNIX1NFVFRJTkdTX0NPVU5UKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIG0gPSB0aGlzLnNldHRpbmdzW2lkeF07XG4gICAgICBtLmJhc2VfdmFsdWUgPSBzZXR0aW5nc1tzZXR0aW5nXS5iYXNlX3ZhbHVlO1xuICAgICAgbS5pbnB1dHNfdXNlZCA9IDA7XG4gICAgICBmb3IgKHByb3AgaW4gc2V0dGluZ3Nbc2V0dGluZ10ucG9pbnRzTGlzdCkge1xuICAgICAgICBwcm9waWR4ID0gZXZhbChcImNvbnN0YW50cy5JTlBVVF9cIiArIHByb3AudG9VcHBlckNhc2UoKSk7XG4gICAgICAgIG0ucG9pbnRzTGlzdFtwcm9waWR4XS5uID0gc2V0dGluZ3Nbc2V0dGluZ10ucG9pbnRzTGlzdFtwcm9wXS5sZW5ndGggLyAyO1xuICAgICAgICBpID0gMDtcbiAgICAgICAgd2hpbGUgKGkgPCBtLnBvaW50c0xpc3RbcHJvcGlkeF0ubikge1xuICAgICAgICAgIG0ucG9pbnRzTGlzdFtwcm9waWR4XS54dmFsdWVzW2ldID0gc2V0dGluZ3Nbc2V0dGluZ10ucG9pbnRzTGlzdFtwcm9wXVtpICogMl07XG4gICAgICAgICAgbS5wb2ludHNMaXN0W3Byb3BpZHhdLnl2YWx1ZXNbaV0gPSBzZXR0aW5nc1tzZXR0aW5nXS5wb2ludHNMaXN0W3Byb3BdW2kgKiAyICsgMV07XG4gICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIG0uaW5wdXRzX3VzZWQgPSAxO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXR0aW5nc19iYXNlX3ZhbHVlc19oYXZlX2NoYW5nZWQoKTtcbiAgfTtcblxuICBCcnVzaC5wcm90b3R5cGUubmV3X3N0cm9rZSA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgICB2YXIgaTtcbiAgICBpID0gMDtcbiAgICB3aGlsZSAoaSA8IGNvbnN0YW50cy5TVEFURV9DT1VOVCkge1xuICAgICAgdGhpcy5zdGF0ZXNbaV0gPSAwO1xuICAgICAgdGhpcy5zZXR0aW5nc192YWx1ZVtpXSA9IDA7XG4gICAgICBpKys7XG4gICAgfVxuICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9YXSA9IHg7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1ldID0geTtcbiAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU1RST0tFXSA9IDA7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NUUk9LRV9TVEFSVEVEXSA9IDA7XG4gICAgdGhpcy5zdHJva2VfY3VycmVudF9pZGxpbmdfdGltZSA9IDA7XG4gICAgdGhpcy5zdHJva2VfdG90YWxfcGFpbnRpbmdfdGltZSA9IDA7XG4gICAgdGhpcy5zdXJmYWNlLmRhYl9jb3VudCA9IDA7XG4gICAgdGhpcy5zdXJmYWNlLmdldGNvbG9yX2NvdW50ID0gMDtcbiAgICByZXR1cm4gdGhpcy5zdHJva2VfdG8odGhpcy5zdXJmYWNlLCB4LCB5LCAwLCAwLCAwLCAxMCk7XG4gIH07XG5cbiAgQnJ1c2gucHJvdG90eXBlLnNldF9iYXNlX3ZhbHVlID0gZnVuY3Rpb24oaWQsIHZhbHVlKSB7XG4gICAgYXNzZXJ0KGlkID49IDAgJiYgaWQgPCBjb25zdGFudHMuQlJVU0hfU0VUVElOR1NfQ09VTlQsIFwiaWQgPCBCUlVTSF9TRVRUSU5HU19DT1VOVFwiKTtcbiAgICB0aGlzLnNldHRpbmdzW2lkXS5iYXNlX3ZhbHVlID0gdmFsdWU7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3NfYmFzZV92YWx1ZXNfaGF2ZV9jaGFuZ2VkKCk7XG4gIH07XG5cbiAgQnJ1c2gucHJvdG90eXBlLnNldF9tYXBwaW5nX24gPSBmdW5jdGlvbihpZCwgaW5wdXQsIG4pIHtcbiAgICBhc3NlcnQoaWQgPj0gMCAmJiBpZCA8IGNvbnN0YW50cy5CUlVTSF9TRVRUSU5HU19DT1VOVCwgXCJpZCA8QlJVU0hfU0VUVElOR1NfQ09VTlRcIik7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3NbaWRdLnNldF9uKGlucHV0LCBuKTtcbiAgfTtcblxuICBCcnVzaC5wcm90b3R5cGUuc2V0X21hcHBpbmdfcG9pbnQgPSBmdW5jdGlvbihpZCwgaW5wdXQsIGluZGV4LCB4LCB5KSB7XG4gICAgYXNzZXJ0KGlkID49IDAgJiYgaWQgPCBjb25zdGFudHMuQlJVU0hfU0VUVElOR1NfQ09VTlQsIFwiaWQ8QlJVU0hfU0VUVElOR1NfQ09VTlRcIik7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3NbaWRdLnNldF9wb2ludChpbnB1dCwgaW5kZXgsIHgsIHkpO1xuICB9O1xuXG4gIEJydXNoLnByb3RvdHlwZS5leHBfZGVjYXkgPSBmdW5jdGlvbih0X2NvbnN0LCB0KSB7XG4gICAgaWYgKHRfY29uc3QgPD0gMC4wMDEpIHtcbiAgICAgIHJldHVybiAwLjA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBNYXRoLmV4cCgtdCAvIHRfY29uc3QpO1xuICAgIH1cbiAgfTtcblxuICBCcnVzaC5wcm90b3R5cGUuc2V0dGluZ3NfYmFzZV92YWx1ZXNfaGF2ZV9jaGFuZ2VkID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGMxLCBmaXgxX3gsIGZpeDFfeSwgZml4Ml9keSwgZml4Ml94LCBnYW1tYSwgaSwgbSwgcSwgX3Jlc3VsdHM7XG4gICAgaSA9IDA7XG4gICAgX3Jlc3VsdHMgPSBbXTtcbiAgICB3aGlsZSAoaSA8IDIpIHtcbiAgICAgIGdhbW1hID0gdm9pZCAwO1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgZ2FtbWEgPSB0aGlzLnNldHRpbmdzW2NvbnN0YW50cy5CUlVTSF9TUEVFRDFfR0FNTUFdLmJhc2VfdmFsdWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnYW1tYSA9IHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX1NQRUVEMl9HQU1NQV0uYmFzZV92YWx1ZTtcbiAgICAgIH1cbiAgICAgIGdhbW1hID0gTWF0aC5leHAoZ2FtbWEpO1xuICAgICAgZml4MV94ID0gNDUuMDtcbiAgICAgIGZpeDFfeSA9IDAuNTtcbiAgICAgIGZpeDJfeCA9IDQ1LjA7XG4gICAgICBmaXgyX2R5ID0gMC4wMTU7XG4gICAgICBjMSA9IE1hdGgubG9nKGZpeDFfeCArIGdhbW1hKTtcbiAgICAgIG0gPSBmaXgyX2R5ICogKGZpeDJfeCArIGdhbW1hKTtcbiAgICAgIHEgPSBmaXgxX3kgLSBtICogYzE7XG4gICAgICB0aGlzLnNwZWVkX21hcHBpbmdfZ2FtbWFbaV0gPSBnYW1tYTtcbiAgICAgIHRoaXMuc3BlZWRfbWFwcGluZ19tW2ldID0gbTtcbiAgICAgIHRoaXMuc3BlZWRfbWFwcGluZ19xW2ldID0gcTtcbiAgICAgIF9yZXN1bHRzLnB1c2goaSsrKTtcbiAgICB9XG4gICAgcmV0dXJuIF9yZXN1bHRzO1xuICB9O1xuXG4gIEJydXNoLnByb3RvdHlwZS51cGRhdGVfc3RhdGVzX2FuZF9zZXR0aW5nX3ZhbHVlcyA9IGZ1bmN0aW9uKHN0ZXBfZHgsIHN0ZXBfZHksIHN0ZXBfZHByZXNzdXJlLCBzdGVwX2RlY2xpbmF0aW9uLCBzdGVwX2FzY2Vuc2lvbiwgc3RlcF9kdGltZSkge1xuICAgIHZhciBhYSwgYmFzZV9yYWRpdXMsIGR4LCBkeF9vbGQsIGR5LCBkeV9vbGQsIGZhYywgZnJlcXVlbmN5LCBpLCBpbnB1dHMsIG5vcm1fZGlzdCwgbm9ybV9keCwgbm9ybV9keSwgbm9ybV9zcGVlZCwgcHJlc3N1cmUsIHJhZGl1c19sb2csIHN0ZXBfaW5fZGFidGltZSwgdGltZV9jb25zdGFudCwgd3JhcDtcbiAgICBwcmVzc3VyZSA9IHZvaWQgMDtcbiAgICBpbnB1dHMgPSBuZXcgQXJyYXkoY29uc3RhbnRzLklOUFVUX0NPVU5UKTtcbiAgICBpZiAoc3RlcF9kdGltZSA8IDAuMCkge1xuICAgICAgc3RlcF9kdGltZSA9IDAuMDAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoc3RlcF9kdGltZSA9PT0gMC4wKSB7XG4gICAgICAgIHN0ZXBfZHRpbWUgPSAwLjAwMTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1hdICs9IHN0ZXBfZHg7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1ldICs9IHN0ZXBfZHk7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1BSRVNTVVJFXSArPSBzdGVwX2RwcmVzc3VyZTtcbiAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfREVDTElOQVRJT05dICs9IHN0ZXBfZGVjbGluYXRpb247XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FTQ0VOU0lPTl0gKz0gc3RlcF9hc2NlbnNpb247XG4gICAgYmFzZV9yYWRpdXMgPSBNYXRoLmV4cCh0aGlzLnNldHRpbmdzW2NvbnN0YW50cy5CUlVTSF9SQURJVVNfTE9HQVJJVEhNSUNdLmJhc2VfdmFsdWUpO1xuICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9QUkVTU1VSRV0gPSBjbGFtcCh0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfUFJFU1NVUkVdLCAwLjAsIDEuMCk7XG4gICAgcHJlc3N1cmUgPSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfUFJFU1NVUkVdO1xuICAgIGlmICghdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NUUk9LRV9TVEFSVEVEXSkge1xuICAgICAgaWYgKHByZXNzdXJlID4gdGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfU1RST0tFX1RSRVNIT0xEXS5iYXNlX3ZhbHVlICsgMC4wMDAxKSB7XG4gICAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TVFJPS0VfU1RBUlRFRF0gPSAxO1xuICAgICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU1RST0tFXSA9IDAuMDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHByZXNzdXJlIDw9IHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX1NUUk9LRV9UUkVTSE9MRF0uYmFzZV92YWx1ZSAqIDAuOSArIDAuMDAwMSkge1xuICAgICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU1RST0tFX1NUQVJURURdID0gMDtcbiAgICAgIH1cbiAgICB9XG4gICAgbm9ybV9keCA9IHN0ZXBfZHggLyBzdGVwX2R0aW1lIC8gYmFzZV9yYWRpdXM7XG4gICAgbm9ybV9keSA9IHN0ZXBfZHkgLyBzdGVwX2R0aW1lIC8gYmFzZV9yYWRpdXM7XG4gICAgbm9ybV9zcGVlZCA9IE1hdGguc3FydChub3JtX2R4ICogbm9ybV9keCArIG5vcm1fZHkgKiBub3JtX2R5KTtcbiAgICBub3JtX2Rpc3QgPSBub3JtX3NwZWVkICogc3RlcF9kdGltZTtcbiAgICBpbnB1dHNbY29uc3RhbnRzLklOUFVUX1BSRVNTVVJFXSA9IHByZXNzdXJlO1xuICAgIGlucHV0c1tjb25zdGFudHMuSU5QVVRfU1BFRUQxXSA9IE1hdGgubG9nKHRoaXMuc3BlZWRfbWFwcGluZ19nYW1tYVswXSArIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9OT1JNX1NQRUVEMV9TTE9XXSkgKiB0aGlzLnNwZWVkX21hcHBpbmdfbVswXSArIHRoaXMuc3BlZWRfbWFwcGluZ19xWzBdO1xuICAgIGlucHV0c1tjb25zdGFudHMuSU5QVVRfU1BFRUQyXSA9IE1hdGgubG9nKHRoaXMuc3BlZWRfbWFwcGluZ19nYW1tYVsxXSArIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9OT1JNX1NQRUVEMl9TTE9XXSkgKiB0aGlzLnNwZWVkX21hcHBpbmdfbVsxXSArIHRoaXMuc3BlZWRfbWFwcGluZ19xWzFdO1xuICAgIGlucHV0c1tjb25zdGFudHMuSU5QVVRfUkFORE9NXSA9IE1hdGgucmFuZG9tKCk7XG4gICAgaW5wdXRzW2NvbnN0YW50cy5JTlBVVF9TVFJPS0VdID0gTWF0aC5taW4odGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NUUk9LRV0sIDEuMCk7XG4gICAgaW5wdXRzW2NvbnN0YW50cy5JTlBVVF9ESVJFQ1RJT05dID0gbWF0aC5mbW9kZihNYXRoLmF0YW4yKHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9ESVJFQ1RJT05fRFldLCB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfRElSRUNUSU9OX0RYXSkgLyAoMiAqIE1hdGguUEkpICogMzYwICsgMTgwLjAsIDE4MC4wKTtcbiAgICBpbnB1dHNbY29uc3RhbnRzLklOUFVUX1RJTFRfREVDTElOQVRJT05dID0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0RFQ0xJTkFUSU9OXTtcbiAgICBpbnB1dHNbY29uc3RhbnRzLklOUFVUX1RJTFRfQVNDRU5TSU9OXSA9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BU0NFTlNJT05dO1xuICAgIGlucHV0c1tjb25zdGFudHMuSU5QVVRfQ1VTVE9NXSA9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9DVVNUT01fSU5QVVRdO1xuICAgIGkgPSAwO1xuICAgIHdoaWxlIChpIDwgY29uc3RhbnRzLkJSVVNIX1NFVFRJTkdTX0NPVU5UKSB7XG4gICAgICBpZiAoaSA9PT0gY29uc3RhbnRzLkJSVVNIX0VMTElQVElDQUxfREFCX1JBVElPKSB7XG4gICAgICAgIGFhID0gMDtcbiAgICAgIH1cbiAgICAgIHRoaXMuc2V0dGluZ3NfdmFsdWVbaV0gPSB0aGlzLnNldHRpbmdzW2ldLmNhbGN1bGF0ZShpbnB1dHMpO1xuICAgICAgaSsrO1xuICAgIH1cbiAgICBmYWMgPSAxLjAgLSB0aGlzLmV4cF9kZWNheSh0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9TTE9XX1RSQUNLSU5HX1BFUl9EQUJdLCAxLjApO1xuICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfWF0gKz0gKHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9YXSAtIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfWF0pICogZmFjO1xuICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfWV0gKz0gKHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9ZXSAtIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfWV0pICogZmFjO1xuICAgIGZhYyA9IDEuMCAtIHRoaXMuZXhwX2RlY2F5KHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX1NQRUVEMV9TTE9XTkVTU10sIHN0ZXBfZHRpbWUpO1xuICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9OT1JNX1NQRUVEMV9TTE9XXSArPSAobm9ybV9zcGVlZCAtIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9OT1JNX1NQRUVEMV9TTE9XXSkgKiBmYWM7XG4gICAgZmFjID0gMS4wIC0gdGhpcy5leHBfZGVjYXkodGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfU1BFRUQyX1NMT1dORVNTXSwgc3RlcF9kdGltZSk7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX05PUk1fU1BFRUQyX1NMT1ddICs9IChub3JtX3NwZWVkIC0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX05PUk1fU1BFRUQyX1NMT1ddKSAqIGZhYztcbiAgICB0aW1lX2NvbnN0YW50ID0gTWF0aC5leHAodGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfT0ZGU0VUX0JZX1NQRUVEX1NMT1dORVNTXSAqIDAuMDEpIC0gMS4wO1xuICAgIGlmICh0aW1lX2NvbnN0YW50IDwgMC4wMDIpIHtcbiAgICAgIHRpbWVfY29uc3RhbnQgPSAwLjAwMjtcbiAgICB9XG4gICAgZmFjID0gMS4wIC0gdGhpcy5leHBfZGVjYXkodGltZV9jb25zdGFudCwgc3RlcF9kdGltZSk7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX05PUk1fRFhfU0xPV10gKz0gKG5vcm1fZHggLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfTk9STV9EWF9TTE9XXSkgKiBmYWM7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX05PUk1fRFlfU0xPV10gKz0gKG5vcm1fZHkgLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfTk9STV9EWV9TTE9XXSkgKiBmYWM7XG4gICAgZHggPSBzdGVwX2R4IC8gYmFzZV9yYWRpdXM7XG4gICAgZHkgPSBzdGVwX2R5IC8gYmFzZV9yYWRpdXM7XG4gICAgc3RlcF9pbl9kYWJ0aW1lID0gaHlwb3RmKGR4LCBkeSk7XG4gICAgZmFjID0gMS4wIC0gdGhpcy5leHBfZGVjYXkoTWF0aC5leHAodGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfRElSRUNUSU9OX0ZJTFRFUl0gKiAwLjUpIC0gMS4wLCBzdGVwX2luX2RhYnRpbWUpO1xuICAgIGR4X29sZCA9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9ESVJFQ1RJT05fRFhdO1xuICAgIGR5X29sZCA9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9ESVJFQ1RJT05fRFldO1xuICAgIGlmIChNYXRoLnNxcnQoZHhfb2xkIC0gZHgpICsgTWF0aC5zcXJ0KGR5X29sZCAtIGR5KSA+IE1hdGguc3FydChkeF9vbGQgLSAoLWR4KSkgKyBNYXRoLnNxcnQoZHlfb2xkIC0gKC1keSkpKSB7XG4gICAgICBkeCA9IC1keDtcbiAgICAgIGR5ID0gLWR5O1xuICAgIH1cbiAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfRElSRUNUSU9OX0RYXSArPSAoZHggLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfRElSRUNUSU9OX0RYXSkgKiBmYWM7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0RJUkVDVElPTl9EWV0gKz0gKGR5IC0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0RJUkVDVElPTl9EWV0pICogZmFjO1xuICAgIGZhYyA9IDEuMCAtIHRoaXMuZXhwX2RlY2F5KHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX0NVU1RPTV9JTlBVVF9TTE9XTkVTU10sIDAuMSk7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0NVU1RPTV9JTlBVVF0gKz0gKHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX0NVU1RPTV9JTlBVVF0gLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfQ1VTVE9NX0lOUFVUXSkgKiBmYWM7XG4gICAgZnJlcXVlbmN5ID0gTWF0aC5leHAoLXRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX1NUUk9LRV9EVVJBVElPTl9MT0dBUklUSE1JQ10pO1xuICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TVFJPS0VdICs9IG5vcm1fZGlzdCAqIGZyZXF1ZW5jeTtcbiAgICBpZiAodGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NUUk9LRV0gPCAwKSB7XG4gICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU1RST0tFXSA9IDA7XG4gICAgfVxuICAgIHdyYXAgPSAxLjAgKyB0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9TVFJPS0VfSE9MRFRJTUVdO1xuICAgIGlmICh0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU1RST0tFXSA+IHdyYXApIHtcbiAgICAgIGlmICh3cmFwID4gOS45ICsgMS4wKSB7XG4gICAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TVFJPS0VdID0gMS4wO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NUUk9LRV0gPSBtYXRoLmZtb2RmKHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TVFJPS0VdLCB3cmFwKTtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TVFJPS0VdIDwgMCkge1xuICAgICAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TVFJPS0VdID0gMDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByYWRpdXNfbG9nID0gdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfUkFESVVTX0xPR0FSSVRITUlDXTtcbiAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfQUNUVUFMX1JBRElVU10gPSBNYXRoLmV4cChyYWRpdXNfbG9nKTtcbiAgICBpZiAodGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9SQURJVVNdIDwgY29uc3RhbnRzLkFDVFVBTF9SQURJVVNfTUlOKSB7XG4gICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfQUNUVUFMX1JBRElVU10gPSBjb25zdGFudHMuQUNUVUFMX1JBRElVU19NSU47XG4gICAgfVxuICAgIGlmICh0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfQUNUVUFMX1JBRElVU10gPiBjb25zdGFudHMuQUNUVUFMX1JBRElVU19NQVgpIHtcbiAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfUkFESVVTXSA9IGNvbnN0YW50cy5BQ1RVQUxfUkFESVVTX01BWDtcbiAgICB9XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9FTExJUFRJQ0FMX0RBQl9SQVRJT10gPSB0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9FTExJUFRJQ0FMX0RBQl9SQVRJT107XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfRUxMSVBUSUNBTF9EQUJfQU5HTEVdID0gdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfRUxMSVBUSUNBTF9EQUJfQU5HTEVdO1xuICB9O1xuXG4gIEJydXNoLnByb3RvdHlwZS5wcmVwYXJlX2FuZF9kcmF3X2RhYiA9IGZ1bmN0aW9uKHN1cmZhY2UpIHtcbiAgICB2YXIgYSwgYWxwaGEsIGFscGhhX2NvcnJlY3Rpb24sIGFscGhhX2RhYiwgYW1wLCBiLCBiYXNlX3JhZGl1cywgYmV0YSwgYmV0YV9kYWIsIGNvbG9yX2gsIGNvbG9yX3MsIGNvbG9yX3YsIGNvbG9yaHNsLCBjb2xvcmhzdiwgY29sb3JyZ2IsIGRhYnNfcGVyX3BpeGVsLCBlcmFzZXJfdGFyZ2V0X2FscGhhLCBmYWMsIGcsIGhhcmRuZXNzLCBvcGFxdWUsIHB4LCBweSwgciwgcmFkaXVzLCByYWRpdXNfbG9nLCBzbXVkZ2VfcmFkaXVzLCB4LCB5O1xuICAgIGlmICh0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9PUEFRVUVdIDwgMCkge1xuICAgICAgc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX09QQVFVRV0gPSAwO1xuICAgIH1cbiAgICBvcGFxdWUgPSB0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9PUEFRVUVdICogdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfT1BBUVVFX01VTFRJUExZXTtcbiAgICBvcGFxdWUgPSBtYXRoLmNsYW1wKG9wYXF1ZSwgMC4wLCAxLjApO1xuICAgIGlmICh0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9PUEFRVUVfTElORUFSSVpFXSkge1xuICAgICAgZGFic19wZXJfcGl4ZWwgPSAodGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfREFCU19QRVJfQUNUVUFMX1JBRElVU10uYmFzZV92YWx1ZSArIHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX0RBQlNfUEVSX0JBU0lDX1JBRElVU10uYmFzZV92YWx1ZSkgKiAyLjA7XG4gICAgICBpZiAoZGFic19wZXJfcGl4ZWwgPCAxLjApIHtcbiAgICAgICAgZGFic19wZXJfcGl4ZWwgPSAxLjA7XG4gICAgICB9XG4gICAgICBkYWJzX3Blcl9waXhlbCA9IDEuMCArIHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX09QQVFVRV9MSU5FQVJJWkVdLmJhc2VfdmFsdWUgKiAoZGFic19wZXJfcGl4ZWwgLSAxLjApO1xuICAgICAgYWxwaGEgPSBvcGFxdWU7XG4gICAgICBiZXRhID0gMS4wIC0gYWxwaGE7XG4gICAgICBiZXRhX2RhYiA9IE1hdGgucG93KGJldGEsIDEuMCAvIGRhYnNfcGVyX3BpeGVsKTtcbiAgICAgIGFscGhhX2RhYiA9IDEuMCAtIGJldGFfZGFiO1xuICAgICAgb3BhcXVlID0gYWxwaGFfZGFiO1xuICAgIH1cbiAgICB4ID0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9YXTtcbiAgICB5ID0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9ZXTtcbiAgICBiYXNlX3JhZGl1cyA9IE1hdGguZXhwKHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX1JBRElVU19MT0dBUklUSE1JQ10uYmFzZV92YWx1ZSk7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX09GRlNFVF9CWV9TUEVFRF0pIHtcbiAgICAgIHggKz0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX05PUk1fRFhfU0xPV10gKiB0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9PRkZTRVRfQllfU1BFRURdICogMC4xICogYmFzZV9yYWRpdXM7XG4gICAgICB5ICs9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9OT1JNX0RZX1NMT1ddICogdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfT0ZGU0VUX0JZX1NQRUVEXSAqIDAuMSAqIGJhc2VfcmFkaXVzO1xuICAgIH1cbiAgICBpZiAodGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfT0ZGU0VUX0JZX1JBTkRPTV0pIHtcbiAgICAgIGFtcCA9IHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX09GRlNFVF9CWV9SQU5ET01dO1xuICAgICAgaWYgKGFtcCA8IDAuMCkge1xuICAgICAgICBhbXAgPSAwLjA7XG4gICAgICB9XG4gICAgICB4ICs9IHJhbmRfZ2F1c3MoKSAqIGFtcCAqIGJhc2VfcmFkaXVzO1xuICAgICAgeSArPSByYW5kX2dhdXNzKCkgKiBhbXAgKiBiYXNlX3JhZGl1cztcbiAgICB9XG4gICAgcmFkaXVzID0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9SQURJVVNdO1xuICAgIGlmICh0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9SQURJVVNfQllfUkFORE9NXSkge1xuICAgICAgcmFkaXVzX2xvZyA9IHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX1JBRElVU19MT0dBUklUSE1JQ107XG4gICAgICByYWRpdXNfbG9nICs9IHJhbmRfZ2F1c3MoKSAqIHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX1JBRElVU19CWV9SQU5ET01dO1xuICAgICAgcmFkaXVzID0gTWF0aC5leHAocmFkaXVzX2xvZyk7XG4gICAgICByYWRpdXMgPSBjbGFtcChyYWRpdXMsIGNvbnN0YW50cy5BQ1RVQUxfUkFESVVTX01JTiwgY29uc3RhbnRzLkFDVFVBTF9SQURJVVNfTUFYKTtcbiAgICAgIGFscGhhX2NvcnJlY3Rpb24gPSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfQUNUVUFMX1JBRElVU10gLyByYWRpdXM7XG4gICAgICBhbHBoYV9jb3JyZWN0aW9uID0gTWF0aC5zcXJ0KGFscGhhX2NvcnJlY3Rpb24pO1xuICAgICAgaWYgKGFscGhhX2NvcnJlY3Rpb24gPD0gMS4wKSB7XG4gICAgICAgIG9wYXF1ZSAqPSBhbHBoYV9jb3JyZWN0aW9uO1xuICAgICAgfVxuICAgIH1cbiAgICBjb2xvcmhzdiA9IG5ldyBjb2xvci5IU1YodGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfQ09MT1JfSFVFXS5iYXNlX3ZhbHVlLCB0aGlzLnNldHRpbmdzW2NvbnN0YW50cy5CUlVTSF9DT0xPUl9TQVRVUkFUSU9OXS5iYXNlX3ZhbHVlLCB0aGlzLnNldHRpbmdzW2NvbnN0YW50cy5CUlVTSF9DT0xPUl9WQUxVRV0uYmFzZV92YWx1ZSk7XG4gICAgY29sb3JfaCA9IGNvbG9yaHN2Lmh1ZSgpO1xuICAgIGNvbG9yX3MgPSBjb2xvcmhzdi5zYXR1cmF0aW9uKCk7XG4gICAgY29sb3JfdiA9IGNvbG9yaHN2LnZhbHVlKCk7XG4gICAgZXJhc2VyX3RhcmdldF9hbHBoYSA9IDEuMDtcbiAgICBpZiAodGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfU01VREdFXSA+IDAuMCkge1xuICAgICAgY29sb3JfaCA9IGNvbG9yaHN2LnJlZCgpO1xuICAgICAgY29sb3JfcyA9IGNvbG9yaHN2LmdyZWVuKCk7XG4gICAgICBjb2xvcl92ID0gY29sb3Joc3YuYmx1ZSgpO1xuICAgICAgZmFjID0gdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfU01VREdFXTtcbiAgICAgIGlmIChmYWMgPiAxLjApIHtcbiAgICAgICAgZmFjID0gMS4wO1xuICAgICAgfVxuICAgICAgZXJhc2VyX3RhcmdldF9hbHBoYSA9ICgxIC0gZmFjKSAqIDEuMCArIGZhYyAqIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TTVVER0VfQV07XG4gICAgICBlcmFzZXJfdGFyZ2V0X2FscGhhID0gY2xhbXAoZXJhc2VyX3RhcmdldF9hbHBoYSwgMC4wLCAxLjApO1xuICAgICAgaWYgKGVyYXNlcl90YXJnZXRfYWxwaGEgPiAwKSB7XG4gICAgICAgIGNvbG9yX2ggPSAoZmFjICogdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NNVURHRV9SQV0gKyAoMSAtIGZhYykgKiBjb2xvcl9oKSAvIGVyYXNlcl90YXJnZXRfYWxwaGE7XG4gICAgICAgIGNvbG9yX3MgPSAoZmFjICogdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NNVURHRV9HQV0gKyAoMSAtIGZhYykgKiBjb2xvcl9zKSAvIGVyYXNlcl90YXJnZXRfYWxwaGE7XG4gICAgICAgIGNvbG9yX3YgPSAoZmFjICogdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1NNVURHRV9CQV0gKyAoMSAtIGZhYykgKiBjb2xvcl92KSAvIGVyYXNlcl90YXJnZXRfYWxwaGE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2xvcl9oID0gMS4wO1xuICAgICAgICBjb2xvcl9zID0gMC4wO1xuICAgICAgICBjb2xvcl92ID0gMC4wO1xuICAgICAgfVxuICAgICAgY29sb3JyZ2IgPSBuZXcgY29sb3IuUkdCKGNvbG9yX2gsIGNvbG9yX3MsIGNvbG9yX3YpO1xuICAgICAgY29sb3JfaCA9IGNvbG9yaHN2Lmh1ZSgpO1xuICAgICAgY29sb3JfcyA9IGNvbG9yaHN2LnNhdHVyYXRpb24oKTtcbiAgICAgIGNvbG9yX3YgPSBjb2xvcmhzdi52YWx1ZSgpO1xuICAgIH1cbiAgICBpZiAodGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfU01VREdFX0xFTkdUSF0gPCAxLjAgJiYgKHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX1NNVURHRV0gIT09IDAuMCB8fCAhdGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfU01VREdFXS5pc19jb25zdGFudCgpKSkge1xuICAgICAgc211ZGdlX3JhZGl1cyA9IHJhZGl1cyAqIE1hdGguZXhwKHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX1NNVURHRV9SQURJVVNfTE9HXSk7XG4gICAgICBzbXVkZ2VfcmFkaXVzID0gY2xhbXAoc211ZGdlX3JhZGl1cywgY29uc3RhbnRzLkFDVFVBTF9SQURJVVNfTUlOLCBjb25zdGFudHMuQUNUVUFMX1JBRElVU19NQVgpO1xuICAgICAgZmFjID0gdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfU01VREdFX0xFTkdUSF07XG4gICAgICBpZiAoZmFjIDwgMC4wKSB7XG4gICAgICAgIGZhYyA9IDA7XG4gICAgICB9XG4gICAgICBweCA9IE1hdGgucm91bmQoeCk7XG4gICAgICBweSA9IE1hdGgucm91bmQoeSk7XG4gICAgICBzdXJmYWNlLmdldF9jb2xvcihweCwgcHksIHNtdWRnZV9yYWRpdXMpO1xuICAgICAgciA9IHN1cmZhY2UucjtcbiAgICAgIGcgPSBzdXJmYWNlLmc7XG4gICAgICBiID0gc3VyZmFjZS5iO1xuICAgICAgYSA9IHN1cmZhY2UuYTtcbiAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TTVVER0VfQV0gPSBmYWMgKiB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU01VREdFX0FdICsgKDEgLSBmYWMpICogYTtcbiAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TTVVER0VfQV0gPSBjbGFtcCh0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU01VREdFX0FdLCAwLjAsIDEuMCk7XG4gICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU01VREdFX1JBXSA9IGZhYyAqIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TTVVER0VfUkFdICsgKDEgLSBmYWMpICogciAqIGE7XG4gICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU01VREdFX0dBXSA9IGZhYyAqIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TTVVER0VfR0FdICsgKDEgLSBmYWMpICogZyAqIGE7XG4gICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU01VREdFX0JBXSA9IGZhYyAqIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9TTVVER0VfQkFdICsgKDEgLSBmYWMpICogYiAqIGE7XG4gICAgfVxuICAgIGlmICh0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9FUkFTRVJdKSB7XG4gICAgICBlcmFzZXJfdGFyZ2V0X2FscGhhICo9IDEuMCAtIHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX0VSQVNFUl07XG4gICAgfVxuICAgIGNvbG9yX2ggKz0gdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfQ0hBTkdFX0NPTE9SX0hdO1xuICAgIGNvbG9yX3MgKz0gdGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfQ0hBTkdFX0NPTE9SX0hTVl9TXTtcbiAgICBjb2xvcl92ICs9IHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX0NIQU5HRV9DT0xPUl9WXTtcbiAgICBpZiAodGhpcy5zZXR0aW5nc192YWx1ZVtjb25zdGFudHMuQlJVU0hfQ0hBTkdFX0NPTE9SX0xdIHx8IHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX0NIQU5HRV9DT0xPUl9IU0xfU10pIHtcbiAgICAgIGNvbG9yaHN2ID0gbmV3IGNvbG9yLkhTVihjb2xvcl9oLCBjb2xvcl9zLCBjb2xvcl92KTtcbiAgICAgIGNvbG9ycmdiID0gbmV3IGNvbG9yLlJHQihjb2xvcmhzdi5yZWQoKSwgY29sb3Joc3YuZ3JlZW4oKSwgY29sb3Joc3YuYmx1ZSgpKTtcbiAgICAgIGNvbG9ycmdiLmxpZ2h0bmVzcyhjb2xvcnJnYi5saWdodG5lc3MoKSArIHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX0NIQU5HRV9DT0xPUl9MXSk7XG4gICAgICBjb2xvcnJnYi5zYXR1cmF0aW9uKGNvbG9ycmdiLnNhdHVyYXRpb24oKSArIHRoaXMuc2V0dGluZ3NfdmFsdWVbY29uc3RhbnRzLkJSVVNIX0NIQU5HRV9DT0xPUl9IU0xfU10pO1xuICAgICAgY29sb3Joc2wgPSBuZXcgY29sb3IuSFNMKGNvbG9ycmdiLmh1ZSgpLCBjb2xvcnJnYi5zYXR1cmF0aW9uKCksIGNvbG9ycmdiLmxpZ2h0bmVzcygpKTtcbiAgICAgIGNvbG9ycmdiID0gbmV3IGNvbG9yLlJHQihjb2xvcmhzbC5yZWQoKSwgY29sb3Joc2wuZ3JlZW4oKSwgY29sb3Joc2wuYmx1ZSgpKTtcbiAgICAgIGNvbG9yX2ggPSBjb2xvcnJnYi5odWUoKTtcbiAgICAgIGNvbG9yX3MgPSBjb2xvcnJnYi5zYXR1cmF0aW9uKCk7XG4gICAgICBjb2xvcl92ID0gY29sb3JyZ2IudmFsdWUoKTtcbiAgICB9XG4gICAgaGFyZG5lc3MgPSB0aGlzLnNldHRpbmdzX3ZhbHVlW2NvbnN0YW50cy5CUlVTSF9IQVJETkVTU107XG4gICAgY29sb3Joc3YgPSBuZXcgY29sb3IuSFNWKGNvbG9yX2gsIGNvbG9yX3MsIGNvbG9yX3YpO1xuICAgIHJldHVybiBzdXJmYWNlLmRyYXdfZGFiKHgsIHksIHJhZGl1cywgY29sb3Joc3YucmVkKCksIGNvbG9yaHN2LmdyZWVuKCksIGNvbG9yaHN2LmJsdWUoKSwgb3BhcXVlLCBoYXJkbmVzcywgZXJhc2VyX3RhcmdldF9hbHBoYSwgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9FTExJUFRJQ0FMX0RBQl9SQVRJT10sIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfRUxMSVBUSUNBTF9EQUJfQU5HTEVdKTtcbiAgfTtcblxuICBCcnVzaC5wcm90b3R5cGUuY291bnRfZGFic190byA9IGZ1bmN0aW9uKHgsIHksIHByZXNzdXJlLCBkdCkge1xuICAgIHZhciBhbmdsZV9yYWQsIGJhc2VfcmFkaXVzLCBjcywgZGlzdCwgcmVzMSwgcmVzMiwgcmVzMywgc24sIHh4LCB4eHIsIHl5LCB5eXI7XG4gICAgZGlzdCA9IHZvaWQgMDtcbiAgICBpZiAodGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9SQURJVVNdID09PSAwLjApIHtcbiAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfUkFESVVTXSA9IE1hdGguZXhwKHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX1JBRElVU19MT0dBUklUSE1JQ10uYmFzZV92YWx1ZSk7XG4gICAgfVxuICAgIGlmICh0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfQUNUVUFMX1JBRElVU10gPCBjb25zdGFudHMuQUNUVUFMX1JBRElVU19NSU4pIHtcbiAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfUkFESVVTXSA9IGNvbnN0YW50cy5BQ1RVQUxfUkFESVVTX01JTjtcbiAgICB9XG4gICAgaWYgKHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfUkFESVVTXSA+IGNvbnN0YW50cy5BQ1RVQUxfUkFESVVTX01BWCkge1xuICAgICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9SQURJVVNdID0gY29uc3RhbnRzLkFDVFVBTF9SQURJVVNfTUFYO1xuICAgIH1cbiAgICBiYXNlX3JhZGl1cyA9IE1hdGguZXhwKHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX1JBRElVU19MT0dBUklUSE1JQ10uYmFzZV92YWx1ZSk7XG4gICAgaWYgKGJhc2VfcmFkaXVzIDwgY29uc3RhbnRzLkFDVFVBTF9SQURJVVNfTUlOKSB7XG4gICAgICBiYXNlX3JhZGl1cyA9IGNvbnN0YW50cy5BQ1RVQUxfUkFESVVTX01JTjtcbiAgICB9XG4gICAgaWYgKGJhc2VfcmFkaXVzID4gY29uc3RhbnRzLkFDVFVBTF9SQURJVVNfTUFYKSB7XG4gICAgICBiYXNlX3JhZGl1cyA9IGNvbnN0YW50cy5BQ1RVQUxfUkFESVVTX01BWDtcbiAgICB9XG4gICAgeHggPSB4IC0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1hdO1xuICAgIHl5ID0geSAtIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9ZXTtcbiAgICBpZiAodGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9FTExJUFRJQ0FMX0RBQl9SQVRJT10gPiAxLjApIHtcbiAgICAgIGFuZ2xlX3JhZCA9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfRUxMSVBUSUNBTF9EQUJfQU5HTEVdIC8gMzYwICogMiAqIE1hdGguUEk7XG4gICAgICBjcyA9IE1hdGguY29zKGFuZ2xlX3JhZCk7XG4gICAgICBzbiA9IE1hdGguc2luKGFuZ2xlX3JhZCk7XG4gICAgICB5eXIgPSAoeXkgKiBjcyAtIHh4ICogc24pICogdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9FTExJUFRJQ0FMX0RBQl9SQVRJT107XG4gICAgICB4eHIgPSB5eSAqIHNuICsgeHggKiBjcztcbiAgICAgIGRpc3QgPSBNYXRoLnNxcnQoeXlyICogeXlyICsgeHhyICogeHhyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlzdCA9IGh5cG90Zih4eCwgeXkpO1xuICAgIH1cbiAgICByZXMxID0gZGlzdCAvIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfUkFESVVTXSAqIHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX0RBQlNfUEVSX0FDVFVBTF9SQURJVVNdLmJhc2VfdmFsdWU7XG4gICAgcmVzMiA9IGRpc3QgLyBiYXNlX3JhZGl1cyAqIHRoaXMuc2V0dGluZ3NbY29uc3RhbnRzLkJSVVNIX0RBQlNfUEVSX0JBU0lDX1JBRElVU10uYmFzZV92YWx1ZTtcbiAgICByZXMzID0gZHQgKiB0aGlzLnNldHRpbmdzW2NvbnN0YW50cy5CUlVTSF9EQUJTX1BFUl9TRUNPTkRdLmJhc2VfdmFsdWU7XG4gICAgcmV0dXJuIHJlczEgKyByZXMyICsgcmVzMztcbiAgfTtcblxuICBCcnVzaC5wcm90b3R5cGUuc3Ryb2tlX3RvID0gZnVuY3Rpb24oc3VyZmFjZSwgeCwgeSwgcHJlc3N1cmUsIHh0aWx0LCB5dGlsdCwgZHRpbWUpIHtcbiAgICB2YXIgTk8sIFVOS05PV04sIFlFUywgYmFzZV9yYWRpdXMsIGNvc19hbHBoYSwgZGlzdF9tb3ZlZCwgZGlzdF90b2RvLCBkdGltZV9sZWZ0LCBlLCBmYWMsIGZyYWMsIGksIHBhaW50ZWQsIHBhaW50ZWRfbm93LCByYWQsIHN0ZXBfYXNjZW5zaW9uLCBzdGVwX2RlY2xpbmF0aW9uLCBzdGVwX2RwcmVzc3VyZSwgc3RlcF9kdGltZSwgc3RlcF9keCwgc3RlcF9keSwgdGlsdF9hc2NlbnNpb24sIHRpbHRfZGVjbGluYXRpb247XG4gICAgdGlsdF9hc2NlbnNpb24gPSAwLjA7XG4gICAgdGlsdF9kZWNsaW5hdGlvbiA9IDkwLjA7XG4gICAgaWYgKHh0aWx0ICE9PSAwIHx8IHl0aWx0ICE9PSAwKSB7XG4gICAgICB4dGlsdCA9IGNsYW1wKHh0aWx0LCAtMS4wLCAxLjApO1xuICAgICAgeXRpbHQgPSBjbGFtcCh5dGlsdCwgLTEuMCwgMS4wKTtcbiAgICAgIHRpbHRfYXNjZW5zaW9uID0gMTgwLjAgKiBNYXRoLmF0YW4yKC14dGlsdCwgeXRpbHQpIC8gTWF0aC5QSTtcbiAgICAgIGUgPSB2b2lkIDA7XG4gICAgICBpZiAoTWF0aC5hYnMoeHRpbHQpID4gTWF0aC5hYnMoeXRpbHQpKSB7XG4gICAgICAgIGUgPSBNYXRoLnNxcnQoMSArIHl0aWx0ICogeXRpbHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZSA9IE1hdGguc3FydCgxICsgeHRpbHQgKiB4dGlsdCk7XG4gICAgICB9XG4gICAgICByYWQgPSBoeXBvdCh4dGlsdCwgeXRpbHQpO1xuICAgICAgY29zX2FscGhhID0gcmFkIC8gZTtcbiAgICAgIGlmIChjb3NfYWxwaGEgPj0gMS4wKSB7XG4gICAgICAgIGNvc19hbHBoYSA9IDEuMDtcbiAgICAgIH1cbiAgICAgIHRpbHRfZGVjbGluYXRpb24gPSAxODAuMCAqIE1hdGguYWNvcyhjb3NfYWxwaGEpIC8gTWF0aC5QSTtcbiAgICB9XG4gICAgcHJlc3N1cmUgPSBjbGFtcChwcmVzc3VyZSwgMC4wLCAxLjApO1xuICAgIGlmIChkdGltZSA8PSAwKSB7XG4gICAgICBkdGltZSA9IDAuMDAwMTtcbiAgICB9XG4gICAgaWYgKGR0aW1lID4gMC4xMDAgJiYgcHJlc3N1cmUgJiYgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1BSRVNTVVJFXSA9PT0gMCkge1xuICAgICAgdGhpcy5zdHJva2VfdG8oc3VyZmFjZSwgeCwgeSwgMC4wLCA5MC4wLCAwLjAsIGR0aW1lIC0gMC4wMDAxKTtcbiAgICAgIGR0aW1lID0gMC4wMDAxO1xuICAgIH1cbiAgICBpZiAodGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfVFJBQ0tJTkdfTk9JU0VdLmJhc2VfdmFsdWUpIHtcbiAgICAgIGJhc2VfcmFkaXVzID0gTWF0aC5leHAodGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfUkFESVVTX0xPR0FSSVRITUlDXS5iYXNlX3ZhbHVlKTtcbiAgICAgIHggKz0gcmFuZF9nYXVzcygpICogdGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfVFJBQ0tJTkdfTk9JU0VdLmJhc2VfdmFsdWUgKiBiYXNlX3JhZGl1cztcbiAgICAgIHkgKz0gcmFuZF9nYXVzcygpICogdGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfVFJBQ0tJTkdfTk9JU0VdLmJhc2VfdmFsdWUgKiBiYXNlX3JhZGl1cztcbiAgICB9XG4gICAgZmFjID0gMS4wIC0gdGhpcy5leHBfZGVjYXkodGhpcy5zZXR0aW5nc1tjb25zdGFudHMuQlJVU0hfU0xPV19UUkFDS0lOR10uYmFzZV92YWx1ZSwgMTAwLjAgKiBkdGltZSk7XG4gICAgeCA9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9YXSArICh4IC0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1hdKSAqIGZhYztcbiAgICB5ID0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1ldICsgKHkgLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfWV0pICogZmFjO1xuICAgIGRpc3RfbW92ZWQgPSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfRElTVF07XG4gICAgZGlzdF90b2RvID0gdGhpcy5jb3VudF9kYWJzX3RvKHgsIHksIHByZXNzdXJlLCBkdGltZSk7XG4gICAgaWYgKGR0aW1lID4gNSkge1xuICAgICAgaSA9IDA7XG4gICAgICB3aGlsZSAoaSA8IGNvbnN0YW50cy5TVEFURV9DT1VOVCkge1xuICAgICAgICB0aGlzLnN0YXRlc1tpXSA9IDA7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9YXSA9IHg7XG4gICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfWV0gPSB5O1xuICAgICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX1BSRVNTVVJFXSA9IHByZXNzdXJlO1xuICAgICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FDVFVBTF9YXSA9IHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9YXTtcbiAgICAgIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9BQ1RVQUxfWV0gPSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfWV07XG4gICAgICB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfU1RST0tFXSA9IDEuMDtcbiAgICB9XG4gICAgVU5LTk9XTiA9IDA7XG4gICAgWUVTID0gMTtcbiAgICBOTyA9IDI7XG4gICAgcGFpbnRlZCA9IFVOS05PV047XG4gICAgZHRpbWVfbGVmdCA9IGR0aW1lO1xuICAgIHN0ZXBfZHggPSB2b2lkIDA7XG4gICAgc3RlcF9keSA9IHZvaWQgMDtcbiAgICBzdGVwX2RwcmVzc3VyZSA9IHZvaWQgMDtcbiAgICBzdGVwX2R0aW1lID0gdm9pZCAwO1xuICAgIHN0ZXBfZGVjbGluYXRpb24gPSB2b2lkIDA7XG4gICAgc3RlcF9hc2NlbnNpb24gPSB2b2lkIDA7XG4gICAgd2hpbGUgKGRpc3RfbW92ZWQgKyBkaXN0X3RvZG8gPj0gMS4wKSB7XG4gICAgICBmcmFjID0gdm9pZCAwO1xuICAgICAgaWYgKGRpc3RfbW92ZWQgPiAwKSB7XG4gICAgICAgIGZyYWMgPSAoMS4wIC0gZGlzdF9tb3ZlZCkgLyBkaXN0X3RvZG87XG4gICAgICAgIGRpc3RfbW92ZWQgPSAwO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZnJhYyA9IDEuMCAvIGRpc3RfdG9kbztcbiAgICAgIH1cbiAgICAgIHN0ZXBfZHggPSBmcmFjICogKHggLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfWF0pO1xuICAgICAgc3RlcF9keSA9IGZyYWMgKiAoeSAtIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9ZXSk7XG4gICAgICBzdGVwX2RwcmVzc3VyZSA9IGZyYWMgKiAocHJlc3N1cmUgLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfUFJFU1NVUkVdKTtcbiAgICAgIHN0ZXBfZHRpbWUgPSBmcmFjICogKGR0aW1lX2xlZnQgLSAwLjApO1xuICAgICAgc3RlcF9kZWNsaW5hdGlvbiA9IGZyYWMgKiAodGlsdF9kZWNsaW5hdGlvbiAtIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9ERUNMSU5BVElPTl0pO1xuICAgICAgc3RlcF9hc2NlbnNpb24gPSBmcmFjICogKHRpbHRfYXNjZW5zaW9uIC0gdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0FTQ0VOU0lPTl0pO1xuICAgICAgdGhpcy51cGRhdGVfc3RhdGVzX2FuZF9zZXR0aW5nX3ZhbHVlcyhzdGVwX2R4LCBzdGVwX2R5LCBzdGVwX2RwcmVzc3VyZSwgc3RlcF9kZWNsaW5hdGlvbiwgc3RlcF9hc2NlbnNpb24sIHN0ZXBfZHRpbWUpO1xuICAgICAgcGFpbnRlZF9ub3cgPSB0aGlzLnByZXBhcmVfYW5kX2RyYXdfZGFiKHN1cmZhY2UpO1xuICAgICAgaWYgKHBhaW50ZWRfbm93KSB7XG4gICAgICAgIHBhaW50ZWQgPSBZRVM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAocGFpbnRlZCA9PT0gVU5LTk9XTikge1xuICAgICAgICAgIHBhaW50ZWQgPSBOTztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZHRpbWVfbGVmdCAtPSBzdGVwX2R0aW1lO1xuICAgICAgZGlzdF90b2RvID0gdGhpcy5jb3VudF9kYWJzX3RvKHgsIHksIHByZXNzdXJlLCBkdGltZV9sZWZ0KTtcbiAgICB9XG4gICAgc3RlcF9keCA9IHggLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfWF07XG4gICAgc3RlcF9keSA9IHkgLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfWV07XG4gICAgc3RlcF9kcHJlc3N1cmUgPSBwcmVzc3VyZSAtIHRoaXMuc3RhdGVzW2NvbnN0YW50cy5TVEFURV9QUkVTU1VSRV07XG4gICAgc3RlcF9kZWNsaW5hdGlvbiA9IHRpbHRfZGVjbGluYXRpb24gLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfREVDTElOQVRJT05dO1xuICAgIHN0ZXBfYXNjZW5zaW9uID0gdGlsdF9hc2NlbnNpb24gLSB0aGlzLnN0YXRlc1tjb25zdGFudHMuU1RBVEVfQVNDRU5TSU9OXTtcbiAgICBzdGVwX2R0aW1lID0gZHRpbWVfbGVmdDtcbiAgICB0aGlzLnVwZGF0ZV9zdGF0ZXNfYW5kX3NldHRpbmdfdmFsdWVzKHN0ZXBfZHgsIHN0ZXBfZHksIHN0ZXBfZHByZXNzdXJlLCBzdGVwX2RlY2xpbmF0aW9uLCBzdGVwX2FzY2Vuc2lvbiwgc3RlcF9kdGltZSk7XG4gICAgdGhpcy5zdGF0ZXNbY29uc3RhbnRzLlNUQVRFX0RJU1RdID0gZGlzdF9tb3ZlZCArIGRpc3RfdG9kbztcbiAgICBpZiAocGFpbnRlZCA9PT0gVU5LTk9XTikge1xuICAgICAgaWYgKHRoaXMuc3Ryb2tlX2N1cnJlbnRfaWRsaW5nX3RpbWUgPiAwIHx8IHRoaXMuc3Ryb2tlX3RvdGFsX3BhaW50aW5nX3RpbWUgPT09IDApIHtcbiAgICAgICAgcGFpbnRlZCA9IE5PO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFpbnRlZCA9IFlFUztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBhaW50ZWQgPT09IFlFUykge1xuICAgICAgdGhpcy5zdHJva2VfdG90YWxfcGFpbnRpbmdfdGltZSArPSBkdGltZTtcbiAgICAgIHRoaXMuc3Ryb2tlX2N1cnJlbnRfaWRsaW5nX3RpbWUgPSAwO1xuICAgICAgaWYgKHRoaXMuc3Ryb2tlX3RvdGFsX3BhaW50aW5nX3RpbWUgPiA0ICsgMyAqIHByZXNzdXJlKSB7XG4gICAgICAgIGlmIChzdGVwX2RwcmVzc3VyZSA+PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHBhaW50ZWQgPT09IE5PKSB7XG4gICAgICB0aGlzLnN0cm9rZV9jdXJyZW50X2lkbGluZ190aW1lICs9IGR0aW1lO1xuICAgICAgaWYgKHRoaXMuc3Ryb2tlX3RvdGFsX3BhaW50aW5nX3RpbWUgPT09IDApIHtcbiAgICAgICAgaWYgKHRoaXMuc3Ryb2tlX2N1cnJlbnRfaWRsaW5nX3RpbWUgPiAxLjApIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKHRoaXMuc3Ryb2tlX3RvdGFsX3BhaW50aW5nX3RpbWUgKyB0aGlzLnN0cm9rZV9jdXJyZW50X2lkbGluZ190aW1lID4gMS4yICsgNSAqIHByZXNzdXJlKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIHJldHVybiBCcnVzaDtcblxufSkoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCcnVzaDtcbiIsInZhciBDYW52YXNTdXJmYWNlLCBmaW5kUG9zO1xuXG5maW5kUG9zID0gcmVxdWlyZSgnLi91dGlscycpLmZpbmRQb3M7XG5cbkNhbnZhc1N1cmZhY2UgPSAoZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIENhbnZhc1N1cmZhY2UoY2FudmFzKSB7XG4gICAgdGhpcy5jYW52YXMgPSBjYW52YXM7XG4gICAgdGhpcy5yID0gMDtcbiAgICB0aGlzLmcgPSAwO1xuICAgIHRoaXMuYiA9IDA7XG4gICAgdGhpcy5kYWJfY291bnQgPSAwO1xuICAgIHRoaXMuZ2V0Y29sb3JfY291bnQgPSAwO1xuICAgIHRoaXMuY29udGV4dCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoXCIyZFwiKTtcbiAgICB0aGlzLmNvbnRleHQuZmlsbFN0eWxlID0gXCJyZ2JhKDI1NSwyNTUsMjU1LDI1NSlcIjtcbiAgICB0aGlzLmNvbnRleHQuZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMuY2xpZW50V2lkdGgsIHRoaXMuY2FudmFzLmNsaWVudEhlaWdodCk7XG4gICAgdGhpcy5wb3MgPSBmaW5kUG9zKHRoaXMuY2FudmFzKTtcbiAgfVxuXG4gIENhbnZhc1N1cmZhY2UucHJvdG90eXBlLmRyYXdfZGFiID0gZnVuY3Rpb24oeCwgeSwgcmFkaXVzLCBjb2xvcl9yLCBjb2xvcl9nLCBjb2xvcl9iLCBvcGFxdWUsIGhhcmRuZXNzLCBhbHBoYV9lcmFzZXIsIGFzcGVjdF9yYXRpbywgYW5nbGUpIHtcbiAgICB2YXIgYmIsIGcxLCBnZywgaGVpZ2h0LCByciwgd2lkdGg7XG4gICAgaWYgKG9wYXF1ZSA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmRhYl9jb3VudCsrO1xuICAgIGhlaWdodCA9IChyYWRpdXMgKiAyKSAvIGFzcGVjdF9yYXRpbztcbiAgICB3aWR0aCA9IHJhZGl1cyAqIDIgKiAxLjM7XG4gICAgdGhpcy5jb250ZXh0LmJlZ2luUGF0aCgpO1xuICAgIHRoaXMuY29udGV4dC5zYXZlKCk7XG4gICAgcnIgPSBNYXRoLmZsb29yKGNvbG9yX3IgKiAyNTYpO1xuICAgIGdnID0gTWF0aC5mbG9vcihjb2xvcl9nICogMjU2KTtcbiAgICBiYiA9IE1hdGguZmxvb3IoY29sb3JfYiAqIDI1Nik7XG4gICAgdGhpcy5jb250ZXh0LnRyYW5zbGF0ZSh4LCB5KTtcbiAgICBpZiAoaGFyZG5lc3MgPCAxKSB7XG4gICAgICBnMSA9IHRoaXMuY29udGV4dC5jcmVhdGVSYWRpYWxHcmFkaWVudCgwLCAwLCAwLCAwLCAwLCByYWRpdXMpO1xuICAgICAgZzEuYWRkQ29sb3JTdG9wKGhhcmRuZXNzLCBcInJnYmEoXCIgKyByciArIFwiLFwiICsgZ2cgKyBcIixcIiArIGJiICsgXCIsXCIgKyBvcGFxdWUgKyBcIilcIik7XG4gICAgICBnMS5hZGRDb2xvclN0b3AoMSwgXCJyZ2JhKFwiICsgcnIgKyBcIixcIiArIGdnICsgXCIsXCIgKyBiYiArIFwiLDApXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBnMSA9IFwicmdiYShcIiArIHJyICsgXCIsXCIgKyBnZyArIFwiLFwiICsgYmIgKyBcIixcIiArIG9wYXF1ZSArIFwiKVwiO1xuICAgIH1cbiAgICB0aGlzLmNvbnRleHQucm90YXRlKDkwICsgYW5nbGUpO1xuICAgIHRoaXMuY29udGV4dC5tb3ZlVG8oMCwgLWhlaWdodCAvIDIpO1xuICAgIHRoaXMuY29udGV4dC5iZXppZXJDdXJ2ZVRvKHdpZHRoIC8gMiwgLWhlaWdodCAvIDIsIHdpZHRoIC8gMiwgaGVpZ2h0IC8gMiwgMCwgaGVpZ2h0IC8gMik7XG4gICAgdGhpcy5jb250ZXh0LmJlemllckN1cnZlVG8oLXdpZHRoIC8gMiwgaGVpZ2h0IC8gMiwgLXdpZHRoIC8gMiwgLWhlaWdodCAvIDIsIDAsIC1oZWlnaHQgLyAyKTtcbiAgICB0aGlzLmNvbnRleHQuZmlsbFN0eWxlID0gZzE7XG4gICAgdGhpcy5jb250ZXh0LmZpbGwoKTtcbiAgICB0aGlzLmNvbnRleHQucmVzdG9yZSgpO1xuICAgIHJldHVybiB0aGlzLmNvbnRleHQuY2xvc2VQYXRoKCk7XG4gIH07XG5cbiAgQ2FudmFzU3VyZmFjZS5wcm90b3R5cGUuZ2V0X2NvbG9yID0gZnVuY3Rpb24oeCwgeSwgcmFkaXVzKSB7XG4gICAgdmFyIGltZ2QsIHBpeDtcbiAgICB0aGlzLmdldGNvbG9yX2NvdW50Kys7XG4gICAgaW1nZCA9IHRoaXMuY29udGV4dC5nZXRJbWFnZURhdGEoeCwgeSwgMSwgMSk7XG4gICAgcGl4ID0gaW1nZC5kYXRhO1xuICAgIHRoaXMuciA9IHBpeFswXSAvIDI1NTtcbiAgICB0aGlzLmcgPSBwaXhbMV0gLyAyNTU7XG4gICAgdGhpcy5iID0gcGl4WzJdIC8gMjU1O1xuICAgIHJldHVybiB0aGlzLmEgPSBwaXhbM10gLyAyNTU7XG4gIH07XG5cbiAgcmV0dXJuIENhbnZhc1N1cmZhY2U7XG5cbn0pKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gQ2FudmFzU3VyZmFjZTtcbiIsInZhciBDb250cm9sUG9pbnRzO1xuXG5Db250cm9sUG9pbnRzID0gKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBDb250cm9sUG9pbnRzKCkge1xuICAgIHRoaXMueHZhbHVlcyA9IG5ldyBBcnJheSg4KTtcbiAgICB0aGlzLnl2YWx1ZXMgPSBuZXcgQXJyYXkoOCk7XG4gICAgdGhpcy5uID0gMDtcbiAgfVxuXG4gIHJldHVybiBDb250cm9sUG9pbnRzO1xuXG59KSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IENvbnRyb2xQb2ludHM7XG4iLCJ2YXIgQ29udHJvbHMsXG4gIF9fYmluZCA9IGZ1bmN0aW9uKGZuLCBtZSl7IHJldHVybiBmdW5jdGlvbigpeyByZXR1cm4gZm4uYXBwbHkobWUsIGFyZ3VtZW50cyk7IH07IH07XG5cbkNvbnRyb2xzID0gKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBDb250cm9scyhzdXJmYWNlLCBicnVzaCkge1xuICAgIHRoaXMuc3VyZmFjZSA9IHN1cmZhY2U7XG4gICAgdGhpcy5icnVzaCA9IGJydXNoO1xuICAgIHRoaXMubW91c2VkcmFnID0gX19iaW5kKHRoaXMubW91c2VkcmFnLCB0aGlzKTtcbiAgICB0aGlzLm1vdXNldXAgPSBfX2JpbmQodGhpcy5tb3VzZXVwLCB0aGlzKTtcbiAgICB0aGlzLm1vdXNlZG93biA9IF9fYmluZCh0aGlzLm1vdXNlZG93biwgdGhpcyk7XG4gICAgdGhpcy50MSA9IG51bGw7XG4gICAgdGhpcy5jYW52YXMgPSB0aGlzLnN1cmZhY2UuY2FudmFzO1xuICAgIHRoaXMuY2FudmFzUG9zID0gdGhpcy5zdXJmYWNlLnBvcztcbiAgICB0aGlzLmlQYWQgPSBuYXZpZ2F0b3IudXNlckFnZW50Lm1hdGNoKC9pUGFkL2kpICE9PSBudWxsO1xuICAgIHRoaXMubGFzdFggPSAwO1xuICAgIHRoaXMubGFzdFkgPSAwO1xuICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRyYWdcIiwgdGhpcy5tb3VzZWRyYWcpO1xuICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgdGhpcy5tb3VzZWRvd24pO1xuICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMubW91c2V1cCk7XG4gICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCB0aGlzLm1vdXNlZHJhZywgZmFsc2UpO1xuICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIHRoaXMubW91c2Vkb3duLCBmYWxzZSk7XG4gICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMubW91c2V1cCwgZmFsc2UpO1xuICB9XG5cbiAgQ29udHJvbHMucHJvdG90eXBlLnNldEJydXNoID0gZnVuY3Rpb24oYnJ1c2gpIHtcbiAgICByZXR1cm4gdGhpcy5icnVzaCA9IGJydXNoO1xuICB9O1xuXG4gIENvbnRyb2xzLnByb3RvdHlwZS5tb3VzZWRvd24gPSBmdW5jdGlvbihldnQpIHtcbiAgICB2YXIgdGU7XG4gICAgaWYgKHRoaXMuaVBhZCkge1xuICAgICAgdGUgPSBldnQudG91Y2hlcy5pdGVtKDApO1xuICAgICAgdGhpcy5sYXN0WCA9IHRlLmNsaWVudFggLSB0aGlzLmNhbnZhc1Bvcy54O1xuICAgICAgdGhpcy5sYXN0WSA9IHRlLmNsaWVudFkgLSB0aGlzLmNhbnZhc1Bvcy55O1xuICAgICAgdGhpcy5jYW52YXMudG91Y2htb3ZlID0gdGhpcy5tb3VzZWRyYWc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2FudmFzLm9ubW91c2Vtb3ZlID0gdGhpcy5tb3VzZWRyYWc7XG4gICAgICB0aGlzLmxhc3RYID0gZXZ0LmNsaWVudFggLSB0aGlzLmNhbnZhc1Bvcy54O1xuICAgICAgdGhpcy5sYXN0WSA9IGV2dC5jbGllbnRZIC0gdGhpcy5jYW52YXNQb3MueTtcbiAgICB9XG4gICAgdGhpcy50MSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG4gICAgdGhpcy5icnVzaC5uZXdfc3Ryb2tlKHRoaXMubGFzdFgsIHRoaXMubGFzdFkpO1xuICAgIHJldHVybiB0aGlzLm1vdXNlZHJhZyhldnQpO1xuICB9O1xuXG4gIENvbnRyb2xzLnByb3RvdHlwZS5tb3VzZXVwID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgcmV0dXJuIHRoaXMuY2FudmFzLm9ubW91c2Vtb3ZlID0gbnVsbDtcbiAgfTtcblxuICBDb250cm9scy5wcm90b3R5cGUubW91c2VkcmFnID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgdmFyIGN1clgsIGN1clksIGlzRXJhc2VyLCBtb3VzZXByZXNzdXJlLCBwbHVnaW4sIHByZXNzdXJlLCB0ZTtcbiAgICBwbHVnaW4gPSBkb2N1bWVudC5lbWJlZHNbXCJ3YWNvbS1wbHVnaW5cIl07XG4gICAgY3VyWCA9IDA7XG4gICAgY3VyWSA9IDA7XG4gICAgcHJlc3N1cmUgPSB2b2lkIDA7XG4gICAgaXNFcmFzZXIgPSB2b2lkIDA7XG4gICAgbW91c2VwcmVzc3VyZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibW91c2VwcmVzc3VyZVwiKS52YWx1ZTtcbiAgICBpZiAocGx1Z2luKSB7XG4gICAgICBwcmVzc3VyZSA9IHBsdWdpbi5wcmVzc3VyZTtcbiAgICAgIGlzRXJhc2VyID0gcGx1Z2luLmlzRXJhc2VyO1xuICAgICAgaWYgKGlzRXJhc2VyID09IG51bGwpIHtcbiAgICAgICAgaXNFcmFzZXIgPSBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmICgocHJlc3N1cmUgPT0gbnVsbCkgfHwgcHJlc3N1cmUgPT09IDApIHtcbiAgICAgICAgcHJlc3N1cmUgPSBtb3VzZXByZXNzdXJlIC8gMTAwO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBwcmVzc3VyZSA9IHByZXNzdXJlID0gbW91c2VwcmVzc3VyZSAvIDEwMDtcbiAgICAgIGlzRXJhc2VyID0gZmFsc2U7XG4gICAgfVxuICAgIGlmICh0aGlzLmlQYWQpIHtcbiAgICAgIHRlID0gZXZ0LnRvdWNoZXMuaXRlbSgwKTtcbiAgICAgIGN1clggPSB0ZS5jbGllbnRYIC0gdGhpcy5jYW52YXNQb3MueDtcbiAgICAgIGN1clkgPSB0ZS5jbGllbnRZIC0gdGhpcy5jYW52YXNQb3MueTtcbiAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcHJlc3N1cmUgPSBtb3VzZXByZXNzdXJlIC8gMTAwO1xuICAgICAgaXNFcmFzZXIgPSBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgY3VyWCA9IGV2dC5jbGllbnRYIC0gdGhpcy5jYW52YXNQb3MueDtcbiAgICAgIGN1clkgPSBldnQuY2xpZW50WSAtIHRoaXMuY2FudmFzUG9zLnk7XG4gICAgfVxuICAgIHRoaXMuYnJ1c2guc3Ryb2tlX3RvKHRoaXMuc3VyZmFjZSwgY3VyWCwgY3VyWSwgcHJlc3N1cmUsIDkwLCAwLCAoKG5ldyBEYXRlKCkpLmdldFRpbWUoKSAtIHRoaXMudDEpIC8gMTAwMCk7XG4gICAgdGhpcy5sYXN0WCA9IGN1clg7XG4gICAgcmV0dXJuIHRoaXMubGFzdFkgPSBjdXJZO1xuICB9O1xuXG4gIHJldHVybiBDb250cm9scztcblxufSkoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBDb250cm9scztcbiIsInZhciBDb250cm9sUG9pbnRzLCBNYXBwaW5nLCBhc3NlcnQ7XG5cbkNvbnRyb2xQb2ludHMgPSByZXF1aXJlKCcuL0NvbnRyb2xQb2ludHMnKTtcblxuYXNzZXJ0ID0gcmVxdWlyZSgnLi91dGlscycpLmFzc2VydDtcblxuTWFwcGluZyA9IChmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gTWFwcGluZyhpbnB1dGNvdW50KSB7XG4gICAgdmFyIGk7XG4gICAgdGhpcy5pbnB1dHMgPSBpbnB1dGNvdW50O1xuICAgIHRoaXMuaW5wdXRzX3VzZWQgPSAwO1xuICAgIHRoaXMucG9pbnRzTGlzdCA9IG5ldyBBcnJheShpbnB1dGNvdW50KTtcbiAgICBpID0gMDtcbiAgICB3aGlsZSAoaSA8IGlucHV0Y291bnQpIHtcbiAgICAgIHRoaXMucG9pbnRzTGlzdFtpXSA9IG5ldyBDb250cm9sUG9pbnRzKCk7XG4gICAgICBpKys7XG4gICAgfVxuICAgIHRoaXMuYmFzZV92YWx1ZSA9IDA7XG4gIH1cblxuICBNYXBwaW5nLnByb3RvdHlwZS5zZXRfbiA9IGZ1bmN0aW9uKGlucHV0LCBuKSB7XG4gICAgdmFyIHA7XG4gICAgcCA9IHRoaXMucG9pbnRzTGlzdFtpbnB1dF07XG4gICAgaWYgKG4gIT09IDAgJiYgcC5uID09PSAwKSB7XG4gICAgICBpbnB1dHNfdXNlZCsrO1xuICAgIH1cbiAgICBpZiAobiA9PT0gMCAmJiBwLm4gIT09IDApIHtcbiAgICAgIGlucHV0c191c2VkLS07XG4gICAgfVxuICAgIHJldHVybiBwLm4gPSBuO1xuICB9O1xuXG4gIE1hcHBpbmcucHJvdG90eXBlLnNldF9wb2ludCA9IGZ1bmN0aW9uKGlucHV0LCBpbmRleCwgeCwgeSkge1xuICAgIHZhciBwO1xuICAgIHAgPSB0aGlzLnBvaW50c0xpc3RbaW5wdXRdO1xuICAgIGlmIChpbmRleCA+IDApIHtcbiAgICAgIGFzc2VydCh4ID49IHAueHZhbHVlc1tpbmRleCAtIDFdLCBcIiB4IG11c3QgPiBwLT54dmFsdWVzW2luZGV4LTFdXCIpO1xuICAgIH1cbiAgICBwLnh2YWx1ZXNbaW5kZXhdID0geDtcbiAgICByZXR1cm4gcC55dmFsdWVzW2luZGV4XSA9IHk7XG4gIH07XG5cbiAgTWFwcGluZy5wcm90b3R5cGUuaXNfY29uc3RhbnQgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5pbnB1dHNfdXNlZCA9PT0gMDtcbiAgfTtcblxuICBNYXBwaW5nLnByb3RvdHlwZS5jYWxjdWxhdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgdmFyIGksIGosIHAsIHJlc3VsdCwgeCwgeDAsIHgxLCB5LCB5MCwgeTE7XG4gICAgcmVzdWx0ID0gdGhpcy5iYXNlX3ZhbHVlO1xuICAgIGlmICh0aGlzLmlucHV0c191c2VkID09PSAwKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBqID0gMDtcbiAgICB3aGlsZSAoaiA8IHRoaXMuaW5wdXRzKSB7XG4gICAgICBwID0gdGhpcy5wb2ludHNMaXN0W2pdO1xuICAgICAgaWYgKHAubikge1xuICAgICAgICB5ID0gdm9pZCAwO1xuICAgICAgICB4ID0gZGF0YVtqXTtcbiAgICAgICAgeDAgPSBwLnh2YWx1ZXNbMF07XG4gICAgICAgIHkwID0gcC55dmFsdWVzWzBdO1xuICAgICAgICB4MSA9IHAueHZhbHVlc1sxXTtcbiAgICAgICAgeTEgPSBwLnl2YWx1ZXNbMV07XG4gICAgICAgIGkgPSAyO1xuICAgICAgICB3aGlsZSAoaSA8IHAubiAmJiB4ID4geDEpIHtcbiAgICAgICAgICB4MCA9IHgxO1xuICAgICAgICAgIHkwID0geTE7XG4gICAgICAgICAgeDEgPSBwLnh2YWx1ZXNbaV07XG4gICAgICAgICAgeTEgPSBwLnl2YWx1ZXNbaV07XG4gICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIGlmICh4MCA9PT0geDEpIHtcbiAgICAgICAgICB5ID0geTA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgeSA9ICh5MSAqICh4IC0geDApICsgeTAgKiAoeDEgLSB4KSkgLyAoeDEgLSB4MCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0ICs9IHk7XG4gICAgICB9XG4gICAgICBqKys7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgcmV0dXJuIE1hcHBpbmc7XG5cbn0pKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gTWFwcGluZztcbiIsInZhciBjb25zdGFudHM7XG5cbmNvbnN0YW50cyA9IHtcbiAgQUNUVUFMX1JBRElVU19NSU46IDAuMixcbiAgQUNUVUFMX1JBRElVU19NQVg6IDgwMCxcbiAgSU5QVVRfUFJFU1NVUkU6IDAsXG4gIElOUFVUX1NQRUVEMTogMSxcbiAgSU5QVVRfU1BFRUQyOiAyLFxuICBJTlBVVF9SQU5ET006IDMsXG4gIElOUFVUX1NUUk9LRTogNCxcbiAgSU5QVVRfRElSRUNUSU9OOiA1LFxuICBJTlBVVF9USUxUX0RFQ0xJTkFUSU9OOiA2LFxuICBJTlBVVF9USUxUX0FTQ0VOU0lPTjogNyxcbiAgSU5QVVRfQ1VTVE9NOiA4LFxuICBJTlBVVF9DT1VOVDogOSxcbiAgQlJVU0hfT1BBUVVFOiAwLFxuICBCUlVTSF9PUEFRVUVfTVVMVElQTFk6IDEsXG4gIEJSVVNIX09QQVFVRV9MSU5FQVJJWkU6IDIsXG4gIEJSVVNIX1JBRElVU19MT0dBUklUSE1JQzogMyxcbiAgQlJVU0hfSEFSRE5FU1M6IDQsXG4gIEJSVVNIX0RBQlNfUEVSX0JBU0lDX1JBRElVUzogNSxcbiAgQlJVU0hfREFCU19QRVJfQUNUVUFMX1JBRElVUzogNixcbiAgQlJVU0hfREFCU19QRVJfU0VDT05EOiA3LFxuICBCUlVTSF9SQURJVVNfQllfUkFORE9NOiA4LFxuICBCUlVTSF9TUEVFRDFfU0xPV05FU1M6IDksXG4gIEJSVVNIX1NQRUVEMl9TTE9XTkVTUzogMTAsXG4gIEJSVVNIX1NQRUVEMV9HQU1NQTogMTEsXG4gIEJSVVNIX1NQRUVEMl9HQU1NQTogMTIsXG4gIEJSVVNIX09GRlNFVF9CWV9SQU5ET006IDEzLFxuICBCUlVTSF9PRkZTRVRfQllfU1BFRUQ6IDE0LFxuICBCUlVTSF9PRkZTRVRfQllfU1BFRURfU0xPV05FU1M6IDE1LFxuICBCUlVTSF9TTE9XX1RSQUNLSU5HOiAxNixcbiAgQlJVU0hfU0xPV19UUkFDS0lOR19QRVJfREFCOiAxNyxcbiAgQlJVU0hfVFJBQ0tJTkdfTk9JU0U6IDE4LFxuICBCUlVTSF9DT0xPUl9IVUU6IDE5LFxuICBCUlVTSF9DT0xPUl9IOiAxOSxcbiAgQlJVU0hfQ09MT1JfU0FUVVJBVElPTjogMjAsXG4gIEJSVVNIX0NPTE9SX1M6IDIwLFxuICBCUlVTSF9DT0xPUl9WQUxVRTogMjEsXG4gIEJSVVNIX0NPTE9SX1Y6IDIxLFxuICBCUlVTSF9DSEFOR0VfQ09MT1JfSDogMjIsXG4gIEJSVVNIX0NIQU5HRV9DT0xPUl9MOiAyMyxcbiAgQlJVU0hfQ0hBTkdFX0NPTE9SX0hTTF9TOiAyNCxcbiAgQlJVU0hfQ0hBTkdFX0NPTE9SX1Y6IDI1LFxuICBCUlVTSF9DSEFOR0VfQ09MT1JfSFNWX1M6IDI2LFxuICBCUlVTSF9TTVVER0U6IDI3LFxuICBCUlVTSF9TTVVER0VfTEVOR1RIOiAyOCxcbiAgQlJVU0hfU01VREdFX1JBRElVU19MT0c6IDI5LFxuICBCUlVTSF9FUkFTRVI6IDMwLFxuICBCUlVTSF9TVFJPS0VfVFJFU0hPTEQ6IDMxLFxuICBCUlVTSF9TVFJPS0VfVEhSRVNIT0xEOiAzMSxcbiAgQlJVU0hfU1RST0tFX0RVUkFUSU9OX0xPR0FSSVRITUlDOiAzMixcbiAgQlJVU0hfU1RST0tFX0hPTERUSU1FOiAzMyxcbiAgQlJVU0hfQ1VTVE9NX0lOUFVUOiAzNCxcbiAgQlJVU0hfQ1VTVE9NX0lOUFVUX1NMT1dORVNTOiAzNSxcbiAgQlJVU0hfRUxMSVBUSUNBTF9EQUJfUkFUSU86IDM2LFxuICBCUlVTSF9FTExJUFRJQ0FMX0RBQl9BTkdMRTogMzcsXG4gIEJSVVNIX0RJUkVDVElPTl9GSUxURVI6IDM4LFxuICBCUlVTSF9WRVJTSU9OOiAzOSxcbiAgQlJVU0hfU0VUVElOR1NfQ09VTlQ6IDQwLFxuICBCUlVTSF9BREFQVF9DT0xPUl9GUk9NX0lNQUdFOiAxMDAwLFxuICBCUlVTSF9DSEFOR0VfUkFESVVTOiAxMDAwLFxuICBCUlVTSF9HUk9VUDogMTAwMCxcbiAgU1RBVEVfWDogMCxcbiAgU1RBVEVfWTogMSxcbiAgU1RBVEVfUFJFU1NVUkU6IDIsXG4gIFNUQVRFX0RJU1Q6IDMsXG4gIFNUQVRFX0FDVFVBTF9SQURJVVM6IDQsXG4gIFNUQVRFX1NNVURHRV9SQTogNSxcbiAgU1RBVEVfU01VREdFX0dBOiA2LFxuICBTVEFURV9TTVVER0VfQkE6IDcsXG4gIFNUQVRFX1NNVURHRV9BOiA4LFxuICBTVEFURV9BQ1RVQUxfWDogOSxcbiAgU1RBVEVfQUNUVUFMX1k6IDEwLFxuICBTVEFURV9OT1JNX0RYX1NMT1c6IDExLFxuICBTVEFURV9OT1JNX0RZX1NMT1c6IDEyLFxuICBTVEFURV9OT1JNX1NQRUVEMV9TTE9XOiAxMyxcbiAgU1RBVEVfTk9STV9TUEVFRDJfU0xPVzogMTQsXG4gIFNUQVRFX1NUUk9LRTogMTUsXG4gIFNUQVRFX1NUUk9LRV9TVEFSVEVEOiAxNixcbiAgU1RBVEVfQ1VTVE9NX0lOUFVUOiAxNyxcbiAgU1RBVEVfUk5HX1NFRUQ6IDE4LFxuICBTVEFURV9BQ1RVQUxfRUxMSVBUSUNBTF9EQUJfUkFUSU86IDE5LFxuICBTVEFURV9BQ1RVQUxfRUxMSVBUSUNBTF9EQUJfQU5HTEU6IDIwLFxuICBTVEFURV9ESVJFQ1RJT05fRFg6IDIxLFxuICBTVEFURV9ESVJFQ1RJT05fRFk6IDIyLFxuICBTVEFURV9ERUNMSU5BVElPTjogMjMsXG4gIFNUQVRFX0FTQ0VOU0lPTjogMjQsXG4gIFNUQVRFX0NPVU5UOiAyNVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBjb25zdGFudHM7XG4iLCJ2YXIgbWF0aDtcblxubWF0aCA9IHtcbiAgaHlwb3RmOiBmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChhICogYSArIGIgKiBiKTtcbiAgfSxcbiAgaHlwb3Q6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KGEgKiBhICsgYiAqIGIpO1xuICB9LFxuICBjbGFtcDogZnVuY3Rpb24odiwgbWluLCBtYXgpIHtcbiAgICBpZiAodiA+IG1heCkge1xuICAgICAgcmV0dXJuIG1heDtcbiAgICB9IGVsc2UgaWYgKHYgPCBtaW4pIHtcbiAgICAgIHJldHVybiBtaW47XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB2O1xuICAgIH1cbiAgfSxcbiAgZm1vZGY6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICByZXR1cm4gTWF0aC5mbG9vcigoKGEgLyBiKSAlIDEuMCkgKiBiKTtcbiAgfSxcbiAgcmFuZF9nYXVzczogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJhbmQxLCByYW5kMiwgc3VtO1xuICAgIHN1bSA9IDAuMDtcbiAgICByYW5kMSA9IE1hdGguY2VpbChNYXRoLnJhbmRvbSgpICogMHg3ZmZmZmZmKTtcbiAgICByYW5kMiA9IE1hdGguY2VpbChNYXRoLnJhbmRvbSgpICogMHg3ZmZmZmZmKTtcbiAgICBzdW0gKz0gcmFuZDEgJiAweDdmZmY7XG4gICAgc3VtICs9IChyYW5kMSA+PiAxNikgJiAweDdmZmY7XG4gICAgc3VtICs9IHJhbmQyICYgMHg3ZmZmO1xuICAgIHN1bSArPSAocmFuZDIgPj4gMTYpICYgMHg3ZmZmO1xuICAgIHJldHVybiBzdW0gKiA1LjI4NTk2MDg5ODM3ZS01IC0gMy40NjQxMDE2MTUxNDtcbiAgfSxcbiAgbWF4MzogZnVuY3Rpb24oYSwgYiwgYykge1xuICAgIGlmIChhID4gYikge1xuICAgICAgcmV0dXJuIE1hdGgubWF4KGEsIGMpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gTWF0aC5tYXgoYiwgYyk7XG4gICAgfVxuICB9LFxuICBtaW4zOiBmdW5jdGlvbihhLCBiLCBjKSB7XG4gICAgaWYgKGEgPCBiKSB7XG4gICAgICByZXR1cm4gTWF0aC5taW4oYSwgYyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBNYXRoLm1pbihiLCBjKTtcbiAgICB9XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gbWF0aDtcbiIsInZhciBBc3NlcnRFeGNlcHRpb24sIHV0aWxzO1xuXG5Bc3NlcnRFeGNlcHRpb24gPSByZXF1aXJlKFwiLi9Bc3NlcnRFeGNlcHRpb25cIik7XG5cbnV0aWxzID0ge1xuICBhc3NlcnQ6IGZ1bmN0aW9uKGV4cCwgbWVzc2FnZSkge1xuICAgIGlmICghZXhwKSB7XG4gICAgICB0aHJvdyBuZXcgQXNzZXJ0RXhjZXB0aW9uKG1lc3NhZ2UpO1xuICAgIH1cbiAgfSxcbiAgZmluZFBvczogZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGN1cmxlZnQsIGN1cnRvcDtcbiAgICBjdXJsZWZ0ID0gY3VydG9wID0gMDtcbiAgICBpZiAob2JqLm9mZnNldFBhcmVudCkge1xuICAgICAgY3VybGVmdCA9IG9iai5vZmZzZXRMZWZ0O1xuICAgICAgY3VydG9wID0gb2JqLm9mZnNldFRvcDtcbiAgICAgIHdoaWxlIChvYmogPSBvYmoub2Zmc2V0UGFyZW50KSB7XG4gICAgICAgIGN1cmxlZnQgKz0gb2JqLm9mZnNldExlZnQ7XG4gICAgICAgIGN1cnRvcCArPSBvYmoub2Zmc2V0VG9wO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgeDogY3VybGVmdCxcbiAgICAgIHk6IGN1cnRvcFxuICAgIH07XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdXRpbHM7XG4iLCIvKmpzaGludCBldmlsOnRydWUsIG9uZXZhcjpmYWxzZSovXG4vKmdsb2JhbCBkZWZpbmUqL1xudmFyIGluc3RhbGxlZENvbG9yU3BhY2VzID0gW10sXG4gICAgbmFtZWRDb2xvcnMgPSB7fSxcbiAgICB1bmRlZiA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT09ICd1bmRlZmluZWQnO1xuICAgIH0sXG4gICAgY2hhbm5lbFJlZ0V4cCA9IC9cXHMqKFxcLlxcZCt8XFxkKyg/OlxcLlxcZCspPykoJSk/XFxzKi8sXG4gICAgYWxwaGFDaGFubmVsUmVnRXhwID0gL1xccyooXFwuXFxkK3xcXGQrKD86XFwuXFxkKyk/KVxccyovLFxuICAgIGNzc0NvbG9yUmVnRXhwID0gbmV3IFJlZ0V4cChcbiAgICAgICAgICAgICAgICAgICAgICAgICBcIl4ocmdifGhzbHxoc3YpYT9cIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgXCJcXFxcKFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hhbm5lbFJlZ0V4cC5zb3VyY2UgKyBcIixcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5uZWxSZWdFeHAuc291cmNlICsgXCIsXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFubmVsUmVnRXhwLnNvdXJjZSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiKD86LFwiICsgYWxwaGFDaGFubmVsUmVnRXhwLnNvdXJjZSArIFwiKT9cIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgXCJcXFxcKSRcIiwgXCJpXCIpO1xuXG5mdW5jdGlvbiBPTkVDT0xPUihvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5hcHBseShvYmopID09PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb2JqWzBdID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgT05FQ09MT1Jbb2JqWzBdXSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgLy8gQXNzdW1lZCBhcnJheSBmcm9tIC50b0pTT04oKVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBPTkVDT0xPUltvYmpbMF1dKG9iai5zbGljZSgxLCBvYmoubGVuZ3RoKSk7XG4gICAgICAgIH0gZWxzZSBpZiAob2JqLmxlbmd0aCA9PT0gNCkge1xuICAgICAgICAgICAgLy8gQXNzdW1lZCA0IGVsZW1lbnQgaW50IFJHQiBhcnJheSBmcm9tIGNhbnZhcyB3aXRoIGFsbCBjaGFubmVscyBbMDsyNTVdXG4gICAgICAgICAgICByZXR1cm4gbmV3IE9ORUNPTE9SLlJHQihvYmpbMF0gLyAyNTUsIG9ialsxXSAvIDI1NSwgb2JqWzJdIC8gMjU1LCBvYmpbM10gLyAyNTUpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygb2JqID09PSAnc3RyaW5nJykge1xuICAgICAgICB2YXIgbG93ZXJDYXNlZCA9IG9iai50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAobmFtZWRDb2xvcnNbbG93ZXJDYXNlZF0pIHtcbiAgICAgICAgICAgIG9iaiA9ICcjJyArIG5hbWVkQ29sb3JzW2xvd2VyQ2FzZWRdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsb3dlckNhc2VkID09PSAndHJhbnNwYXJlbnQnKSB7XG4gICAgICAgICAgICBvYmogPSAncmdiYSgwLDAsMCwwKSc7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGVzdCBmb3IgQ1NTIHJnYiguLi4uKSBzdHJpbmdcbiAgICAgICAgdmFyIG1hdGNoQ3NzU3ludGF4ID0gb2JqLm1hdGNoKGNzc0NvbG9yUmVnRXhwKTtcbiAgICAgICAgaWYgKG1hdGNoQ3NzU3ludGF4KSB7XG4gICAgICAgICAgICB2YXIgY29sb3JTcGFjZU5hbWUgPSBtYXRjaENzc1N5bnRheFsxXS50b1VwcGVyQ2FzZSgpLFxuICAgICAgICAgICAgICAgIGFscGhhID0gdW5kZWYobWF0Y2hDc3NTeW50YXhbOF0pID8gbWF0Y2hDc3NTeW50YXhbOF0gOiBwYXJzZUZsb2F0KG1hdGNoQ3NzU3ludGF4WzhdKSxcbiAgICAgICAgICAgICAgICBoYXNIdWUgPSBjb2xvclNwYWNlTmFtZVswXSA9PT0gJ0gnLFxuICAgICAgICAgICAgICAgIGZpcnN0Q2hhbm5lbERpdmlzb3IgPSBtYXRjaENzc1N5bnRheFszXSA/IDEwMCA6IChoYXNIdWUgPyAzNjAgOiAyNTUpLFxuICAgICAgICAgICAgICAgIHNlY29uZENoYW5uZWxEaXZpc29yID0gKG1hdGNoQ3NzU3ludGF4WzVdIHx8IGhhc0h1ZSkgPyAxMDAgOiAyNTUsXG4gICAgICAgICAgICAgICAgdGhpcmRDaGFubmVsRGl2aXNvciA9IChtYXRjaENzc1N5bnRheFs3XSB8fCBoYXNIdWUpID8gMTAwIDogMjU1O1xuICAgICAgICAgICAgaWYgKHVuZGVmKE9ORUNPTE9SW2NvbG9yU3BhY2VOYW1lXSkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvbmUuY29sb3IuXCIgKyBjb2xvclNwYWNlTmFtZSArIFwiIGlzIG5vdCBpbnN0YWxsZWQuXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBPTkVDT0xPUltjb2xvclNwYWNlTmFtZV0oXG4gICAgICAgICAgICAgICAgcGFyc2VGbG9hdChtYXRjaENzc1N5bnRheFsyXSkgLyBmaXJzdENoYW5uZWxEaXZpc29yLFxuICAgICAgICAgICAgICAgIHBhcnNlRmxvYXQobWF0Y2hDc3NTeW50YXhbNF0pIC8gc2Vjb25kQ2hhbm5lbERpdmlzb3IsXG4gICAgICAgICAgICAgICAgcGFyc2VGbG9hdChtYXRjaENzc1N5bnRheFs2XSkgLyB0aGlyZENoYW5uZWxEaXZpc29yLFxuICAgICAgICAgICAgICAgIGFscGhhXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFzc3VtZSBoZXggc3ludGF4XG4gICAgICAgIGlmIChvYmoubGVuZ3RoIDwgNikge1xuICAgICAgICAgICAgLy8gQWxsb3cgQ1NTIHNob3J0aGFuZFxuICAgICAgICAgICAgb2JqID0gb2JqLnJlcGxhY2UoL14jPyhbMC05YS1mXSkoWzAtOWEtZl0pKFswLTlhLWZdKSQvaSwgJyQxJDEkMiQyJDMkMycpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFNwbGl0IG9iaiBpbnRvIHJlZCwgZ3JlZW4sIGFuZCBibHVlIGNvbXBvbmVudHNcbiAgICAgICAgdmFyIGhleE1hdGNoID0gb2JqLm1hdGNoKC9eIz8oWzAtOWEtZl1bMC05YS1mXSkoWzAtOWEtZl1bMC05YS1mXSkoWzAtOWEtZl1bMC05YS1mXSkkL2kpO1xuICAgICAgICBpZiAoaGV4TWF0Y2gpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgT05FQ09MT1IuUkdCKFxuICAgICAgICAgICAgICAgIHBhcnNlSW50KGhleE1hdGNoWzFdLCAxNikgLyAyNTUsXG4gICAgICAgICAgICAgICAgcGFyc2VJbnQoaGV4TWF0Y2hbMl0sIDE2KSAvIDI1NSxcbiAgICAgICAgICAgICAgICBwYXJzZUludChoZXhNYXRjaFszXSwgMTYpIC8gMjU1XG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBvYmouaXNDb2xvcikge1xuICAgICAgICByZXR1cm4gb2JqO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGluc3RhbGxDb2xvclNwYWNlKGNvbG9yU3BhY2VOYW1lLCBwcm9wZXJ0eU5hbWVzLCBjb25maWcpIHtcbiAgICBPTkVDT0xPUltjb2xvclNwYWNlTmFtZV0gPSBuZXcgRnVuY3Rpb24ocHJvcGVydHlOYW1lcy5qb2luKFwiLFwiKSxcbiAgICAgICAgLy8gQWxsb3cgcGFzc2luZyBhbiBhcnJheSB0byB0aGUgY29uc3RydWN0b3I6XG4gICAgICAgIFwiaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkoXCIgKyBwcm9wZXJ0eU5hbWVzWzBdICsgXCIpID09PSAnW29iamVjdCBBcnJheV0nKSB7XCIgK1xuICAgICAgICAgICAgcHJvcGVydHlOYW1lcy5tYXAoZnVuY3Rpb24gKHByb3BlcnR5TmFtZSwgaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eU5hbWUgKyBcIj1cIiArIHByb3BlcnR5TmFtZXNbMF0gKyBcIltcIiArIGkgKyBcIl07XCI7XG4gICAgICAgICAgICB9KS5yZXZlcnNlKCkuam9pbihcIlwiKSArXG4gICAgICAgIFwifVwiICtcbiAgICAgICAgXCJpZiAoXCIgKyBwcm9wZXJ0eU5hbWVzLmZpbHRlcihmdW5jdGlvbiAocHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvcGVydHlOYW1lICE9PSAnYWxwaGEnO1xuICAgICAgICB9KS5tYXAoZnVuY3Rpb24gKHByb3BlcnR5TmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIFwiaXNOYU4oXCIgKyBwcm9wZXJ0eU5hbWUgKyBcIilcIjtcbiAgICAgICAgfSkuam9pbihcInx8XCIpICsgXCIpe1wiICsgXCJ0aHJvdyBuZXcgRXJyb3IoXFxcIltcIiArIGNvbG9yU3BhY2VOYW1lICsgXCJdOiBJbnZhbGlkIGNvbG9yOiAoXFxcIitcIiArIHByb3BlcnR5TmFtZXMuam9pbihcIitcXFwiLFxcXCIrXCIpICsgXCIrXFxcIilcXFwiKTt9XCIgK1xuICAgICAgICBwcm9wZXJ0eU5hbWVzLm1hcChmdW5jdGlvbiAocHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlOYW1lID09PSAnaHVlJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBcInRoaXMuX2h1ZT1odWU8MD9odWUtTWF0aC5mbG9vcihodWUpOmh1ZSUxXCI7IC8vIFdyYXBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlOYW1lID09PSAnYWxwaGEnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhpcy5fYWxwaGE9KGlzTmFOKGFscGhhKXx8YWxwaGE+MSk/MTooYWxwaGE8MD8wOmFscGhhKTtcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGhpcy5fXCIgKyBwcm9wZXJ0eU5hbWUgKyBcIj1cIiArIHByb3BlcnR5TmFtZSArIFwiPDA/MDooXCIgKyBwcm9wZXJ0eU5hbWUgKyBcIj4xPzE6XCIgKyBwcm9wZXJ0eU5hbWUgKyBcIilcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkuam9pbihcIjtcIikgKyBcIjtcIlxuICAgICk7XG4gICAgT05FQ09MT1JbY29sb3JTcGFjZU5hbWVdLnByb3BlcnR5TmFtZXMgPSBwcm9wZXJ0eU5hbWVzO1xuXG4gICAgdmFyIHByb3RvdHlwZSA9IE9ORUNPTE9SW2NvbG9yU3BhY2VOYW1lXS5wcm90b3R5cGU7XG5cbiAgICBbJ3ZhbHVlT2YnLCAnaGV4JywgJ2hleGEnLCAnY3NzJywgJ2Nzc2EnXS5mb3JFYWNoKGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG4gICAgICAgIHByb3RvdHlwZVttZXRob2ROYW1lXSA9IHByb3RvdHlwZVttZXRob2ROYW1lXSB8fCAoY29sb3JTcGFjZU5hbWUgPT09ICdSR0InID8gcHJvdG90eXBlLmhleCA6IG5ldyBGdW5jdGlvbihcInJldHVybiB0aGlzLnJnYigpLlwiICsgbWV0aG9kTmFtZSArIFwiKCk7XCIpKTtcbiAgICB9KTtcblxuICAgIHByb3RvdHlwZS5pc0NvbG9yID0gdHJ1ZTtcblxuICAgIHByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAob3RoZXJDb2xvciwgZXBzaWxvbikge1xuICAgICAgICBpZiAodW5kZWYoZXBzaWxvbikpIHtcbiAgICAgICAgICAgIGVwc2lsb24gPSAxZS0xMDtcbiAgICAgICAgfVxuXG4gICAgICAgIG90aGVyQ29sb3IgPSBvdGhlckNvbG9yW2NvbG9yU3BhY2VOYW1lLnRvTG93ZXJDYXNlKCldKCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9wZXJ0eU5hbWVzLmxlbmd0aDsgaSA9IGkgKyAxKSB7XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnModGhpc1snXycgKyBwcm9wZXJ0eU5hbWVzW2ldXSAtIG90aGVyQ29sb3JbJ18nICsgcHJvcGVydHlOYW1lc1tpXV0pID4gZXBzaWxvbikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH07XG5cbiAgICBwcm90b3R5cGUudG9KU09OID0gbmV3IEZ1bmN0aW9uKFxuICAgICAgICBcInJldHVybiBbJ1wiICsgY29sb3JTcGFjZU5hbWUgKyBcIicsIFwiICtcbiAgICAgICAgICAgIHByb3BlcnR5TmFtZXMubWFwKGZ1bmN0aW9uIChwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJ0aGlzLl9cIiArIHByb3BlcnR5TmFtZTtcbiAgICAgICAgICAgIH0sIHRoaXMpLmpvaW4oXCIsIFwiKSArXG4gICAgICAgIFwiXTtcIlxuICAgICk7XG5cbiAgICBmb3IgKHZhciBwcm9wZXJ0eU5hbWUgaW4gY29uZmlnKSB7XG4gICAgICAgIGlmIChjb25maWcuaGFzT3duUHJvcGVydHkocHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgICAgdmFyIG1hdGNoRnJvbUNvbG9yU3BhY2UgPSBwcm9wZXJ0eU5hbWUubWF0Y2goL15mcm9tKC4qKSQvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaEZyb21Db2xvclNwYWNlKSB7XG4gICAgICAgICAgICAgICAgT05FQ09MT1JbbWF0Y2hGcm9tQ29sb3JTcGFjZVsxXS50b1VwcGVyQ2FzZSgpXS5wcm90b3R5cGVbY29sb3JTcGFjZU5hbWUudG9Mb3dlckNhc2UoKV0gPSBjb25maWdbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHJvdG90eXBlW3Byb3BlcnR5TmFtZV0gPSBjb25maWdbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEl0IGlzIHByZXR0eSBlYXN5IHRvIGltcGxlbWVudCB0aGUgY29udmVyc2lvbiB0byB0aGUgc2FtZSBjb2xvciBzcGFjZTpcbiAgICBwcm90b3R5cGVbY29sb3JTcGFjZU5hbWUudG9Mb3dlckNhc2UoKV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgcHJvdG90eXBlLnRvU3RyaW5nID0gbmV3IEZ1bmN0aW9uKFwicmV0dXJuIFxcXCJbb25lLmNvbG9yLlwiICsgY29sb3JTcGFjZU5hbWUgKyBcIjpcXFwiK1wiICsgcHJvcGVydHlOYW1lcy5tYXAoZnVuY3Rpb24gKHByb3BlcnR5TmFtZSwgaSkge1xuICAgICAgICByZXR1cm4gXCJcXFwiIFwiICsgcHJvcGVydHlOYW1lc1tpXSArIFwiPVxcXCIrdGhpcy5fXCIgKyBwcm9wZXJ0eU5hbWU7XG4gICAgfSkuam9pbihcIitcIikgKyBcIitcXFwiXVxcXCI7XCIpO1xuXG4gICAgLy8gR2VuZXJhdGUgZ2V0dGVycyBhbmQgc2V0dGVyc1xuICAgIHByb3BlcnR5TmFtZXMuZm9yRWFjaChmdW5jdGlvbiAocHJvcGVydHlOYW1lLCBpKSB7XG4gICAgICAgIHByb3RvdHlwZVtwcm9wZXJ0eU5hbWVdID0gcHJvdG90eXBlW3Byb3BlcnR5TmFtZSA9PT0gJ2JsYWNrJyA/ICdrJyA6IHByb3BlcnR5TmFtZVswXV0gPSBuZXcgRnVuY3Rpb24oXCJ2YWx1ZVwiLCBcImlzRGVsdGFcIixcbiAgICAgICAgICAgIC8vIFNpbXBsZSBnZXR0ZXIgbW9kZTogY29sb3IucmVkKClcbiAgICAgICAgICAgIFwiaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcIiArXG4gICAgICAgICAgICAgICAgXCJyZXR1cm4gdGhpcy5fXCIgKyBwcm9wZXJ0eU5hbWUgKyBcIjtcIiArXG4gICAgICAgICAgICBcIn1cIiArXG4gICAgICAgICAgICAvLyBBZGp1c3RlcjogY29sb3IucmVkKCsuMiwgdHJ1ZSlcbiAgICAgICAgICAgIFwiaWYgKGlzRGVsdGEpIHtcIiArXG4gICAgICAgICAgICAgICAgXCJyZXR1cm4gbmV3IHRoaXMuY29uc3RydWN0b3IoXCIgKyBwcm9wZXJ0eU5hbWVzLm1hcChmdW5jdGlvbiAob3RoZXJQcm9wZXJ0eU5hbWUsIGkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwidGhpcy5fXCIgKyBvdGhlclByb3BlcnR5TmFtZSArIChwcm9wZXJ0eU5hbWUgPT09IG90aGVyUHJvcGVydHlOYW1lID8gXCIrdmFsdWVcIiA6IFwiXCIpO1xuICAgICAgICAgICAgICAgIH0pLmpvaW4oXCIsIFwiKSArIFwiKTtcIiArXG4gICAgICAgICAgICBcIn1cIiArXG4gICAgICAgICAgICAvLyBTZXR0ZXI6IGNvbG9yLnJlZCguMik7XG4gICAgICAgICAgICBcInJldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3RvcihcIiArIHByb3BlcnR5TmFtZXMubWFwKGZ1bmN0aW9uIChvdGhlclByb3BlcnR5TmFtZSwgaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eU5hbWUgPT09IG90aGVyUHJvcGVydHlOYW1lID8gXCJ2YWx1ZVwiIDogXCJ0aGlzLl9cIiArIG90aGVyUHJvcGVydHlOYW1lO1xuICAgICAgICAgICAgfSkuam9pbihcIiwgXCIpICsgXCIpO1wiKTtcbiAgICB9KTtcblxuICAgIGZ1bmN0aW9uIGluc3RhbGxGb3JlaWduTWV0aG9kcyh0YXJnZXRDb2xvclNwYWNlTmFtZSwgc291cmNlQ29sb3JTcGFjZU5hbWUpIHtcbiAgICAgICAgdmFyIG9iaiA9IHt9O1xuICAgICAgICBvYmpbc291cmNlQ29sb3JTcGFjZU5hbWUudG9Mb3dlckNhc2UoKV0gPSBuZXcgRnVuY3Rpb24oXCJyZXR1cm4gdGhpcy5yZ2IoKS5cIiArIHNvdXJjZUNvbG9yU3BhY2VOYW1lLnRvTG93ZXJDYXNlKCkgKyBcIigpO1wiKTsgLy8gRmFsbGJhY2tcbiAgICAgICAgT05FQ09MT1Jbc291cmNlQ29sb3JTcGFjZU5hbWVdLnByb3BlcnR5TmFtZXMuZm9yRWFjaChmdW5jdGlvbiAocHJvcGVydHlOYW1lLCBpKSB7XG4gICAgICAgICAgICBvYmpbcHJvcGVydHlOYW1lXSA9IG9ialtwcm9wZXJ0eU5hbWUgPT09ICdibGFjaycgPyAnaycgOiBwcm9wZXJ0eU5hbWVbMF1dID0gbmV3IEZ1bmN0aW9uKFwidmFsdWVcIiwgXCJpc0RlbHRhXCIsIFwicmV0dXJuIHRoaXMuXCIgKyBzb3VyY2VDb2xvclNwYWNlTmFtZS50b0xvd2VyQ2FzZSgpICsgXCIoKS5cIiArIHByb3BlcnR5TmFtZSArIFwiKHZhbHVlLCBpc0RlbHRhKTtcIik7XG4gICAgICAgIH0pO1xuICAgICAgICBmb3IgKHZhciBwcm9wIGluIG9iaikge1xuICAgICAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSAmJiBPTkVDT0xPUlt0YXJnZXRDb2xvclNwYWNlTmFtZV0ucHJvdG90eXBlW3Byb3BdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBPTkVDT0xPUlt0YXJnZXRDb2xvclNwYWNlTmFtZV0ucHJvdG90eXBlW3Byb3BdID0gb2JqW3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5zdGFsbGVkQ29sb3JTcGFjZXMuZm9yRWFjaChmdW5jdGlvbiAob3RoZXJDb2xvclNwYWNlTmFtZSkge1xuICAgICAgICBpbnN0YWxsRm9yZWlnbk1ldGhvZHMoY29sb3JTcGFjZU5hbWUsIG90aGVyQ29sb3JTcGFjZU5hbWUpO1xuICAgICAgICBpbnN0YWxsRm9yZWlnbk1ldGhvZHMob3RoZXJDb2xvclNwYWNlTmFtZSwgY29sb3JTcGFjZU5hbWUpO1xuICAgIH0pO1xuXG4gICAgaW5zdGFsbGVkQ29sb3JTcGFjZXMucHVzaChjb2xvclNwYWNlTmFtZSk7XG59XG5cbk9ORUNPTE9SLmluc3RhbGxNZXRob2QgPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgICBpbnN0YWxsZWRDb2xvclNwYWNlcy5mb3JFYWNoKGZ1bmN0aW9uIChjb2xvclNwYWNlKSB7XG4gICAgICAgIE9ORUNPTE9SW2NvbG9yU3BhY2VdLnByb3RvdHlwZVtuYW1lXSA9IGZuO1xuICAgIH0pO1xufTtcblxuaW5zdGFsbENvbG9yU3BhY2UoJ1JHQicsIFsncmVkJywgJ2dyZWVuJywgJ2JsdWUnLCAnYWxwaGEnXSwge1xuICAgIGhleDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgaGV4U3RyaW5nID0gKE1hdGgucm91bmQoMjU1ICogdGhpcy5fcmVkKSAqIDB4MTAwMDAgKyBNYXRoLnJvdW5kKDI1NSAqIHRoaXMuX2dyZWVuKSAqIDB4MTAwICsgTWF0aC5yb3VuZCgyNTUgKiB0aGlzLl9ibHVlKSkudG9TdHJpbmcoMTYpO1xuICAgICAgICByZXR1cm4gJyMnICsgKCcwMDAwMCcuc3Vic3RyKDAsIDYgLSBoZXhTdHJpbmcubGVuZ3RoKSkgKyBoZXhTdHJpbmc7XG4gICAgfSxcblxuICAgIGhleGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFscGhhU3RyaW5nID0gTWF0aC5yb3VuZCh0aGlzLl9hbHBoYSAqIDI1NSkudG9TdHJpbmcoMTYpO1xuICAgICAgICByZXR1cm4gJyMnICsgJzAwJy5zdWJzdHIoMCwgMiAtIGFscGhhU3RyaW5nLmxlbmd0aCkgKyBhbHBoYVN0cmluZyArIHRoaXMuaGV4KCkuc3Vic3RyKDEsIDYpO1xuICAgIH0sXG5cbiAgICBjc3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFwicmdiKFwiICsgTWF0aC5yb3VuZCgyNTUgKiB0aGlzLl9yZWQpICsgXCIsXCIgKyBNYXRoLnJvdW5kKDI1NSAqIHRoaXMuX2dyZWVuKSArIFwiLFwiICsgTWF0aC5yb3VuZCgyNTUgKiB0aGlzLl9ibHVlKSArIFwiKVwiO1xuICAgIH0sXG5cbiAgICBjc3NhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBcInJnYmEoXCIgKyBNYXRoLnJvdW5kKDI1NSAqIHRoaXMuX3JlZCkgKyBcIixcIiArIE1hdGgucm91bmQoMjU1ICogdGhpcy5fZ3JlZW4pICsgXCIsXCIgKyBNYXRoLnJvdW5kKDI1NSAqIHRoaXMuX2JsdWUpICsgXCIsXCIgKyB0aGlzLl9hbHBoYSArIFwiKVwiO1xuICAgIH1cbn0pO1xuaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgIXVuZGVmKGRlZmluZS5hbWQpKSB7XG4gICAgZGVmaW5lKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIE9ORUNPTE9SO1xuICAgIH0pO1xufSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICAvLyBOb2RlIG1vZHVsZSBleHBvcnRcbiAgICBtb2R1bGUuZXhwb3J0cyA9IE9ORUNPTE9SO1xufSBlbHNlIHtcbiAgICBvbmUgPSB3aW5kb3cub25lIHx8IHt9O1xuICAgIG9uZS5jb2xvciA9IE9ORUNPTE9SO1xufVxuXG5pZiAodHlwZW9mIGpRdWVyeSAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5kZWYoalF1ZXJ5LmNvbG9yKSkge1xuICAgIGpRdWVyeS5jb2xvciA9IE9ORUNPTE9SO1xufVxuXG4vKmdsb2JhbCBuYW1lZENvbG9ycyovXG5uYW1lZENvbG9ycyA9IHtcbiAgICBhbGljZWJsdWU6ICdmMGY4ZmYnLFxuICAgIGFudGlxdWV3aGl0ZTogJ2ZhZWJkNycsXG4gICAgYXF1YTogJzBmZicsXG4gICAgYXF1YW1hcmluZTogJzdmZmZkNCcsXG4gICAgYXp1cmU6ICdmMGZmZmYnLFxuICAgIGJlaWdlOiAnZjVmNWRjJyxcbiAgICBiaXNxdWU6ICdmZmU0YzQnLFxuICAgIGJsYWNrOiAnMDAwJyxcbiAgICBibGFuY2hlZGFsbW9uZDogJ2ZmZWJjZCcsXG4gICAgYmx1ZTogJzAwZicsXG4gICAgYmx1ZXZpb2xldDogJzhhMmJlMicsXG4gICAgYnJvd246ICdhNTJhMmEnLFxuICAgIGJ1cmx5d29vZDogJ2RlYjg4NycsXG4gICAgY2FkZXRibHVlOiAnNWY5ZWEwJyxcbiAgICBjaGFydHJldXNlOiAnN2ZmZjAwJyxcbiAgICBjaG9jb2xhdGU6ICdkMjY5MWUnLFxuICAgIGNvcmFsOiAnZmY3ZjUwJyxcbiAgICBjb3JuZmxvd2VyYmx1ZTogJzY0OTVlZCcsXG4gICAgY29ybnNpbGs6ICdmZmY4ZGMnLFxuICAgIGNyaW1zb246ICdkYzE0M2MnLFxuICAgIGN5YW46ICcwZmYnLFxuICAgIGRhcmtibHVlOiAnMDAwMDhiJyxcbiAgICBkYXJrY3lhbjogJzAwOGI4YicsXG4gICAgZGFya2dvbGRlbnJvZDogJ2I4ODYwYicsXG4gICAgZGFya2dyYXk6ICdhOWE5YTknLFxuICAgIGRhcmtncmV5OiAnYTlhOWE5JyxcbiAgICBkYXJrZ3JlZW46ICcwMDY0MDAnLFxuICAgIGRhcmtraGFraTogJ2JkYjc2YicsXG4gICAgZGFya21hZ2VudGE6ICc4YjAwOGInLFxuICAgIGRhcmtvbGl2ZWdyZWVuOiAnNTU2YjJmJyxcbiAgICBkYXJrb3JhbmdlOiAnZmY4YzAwJyxcbiAgICBkYXJrb3JjaGlkOiAnOTkzMmNjJyxcbiAgICBkYXJrcmVkOiAnOGIwMDAwJyxcbiAgICBkYXJrc2FsbW9uOiAnZTk5NjdhJyxcbiAgICBkYXJrc2VhZ3JlZW46ICc4ZmJjOGYnLFxuICAgIGRhcmtzbGF0ZWJsdWU6ICc0ODNkOGInLFxuICAgIGRhcmtzbGF0ZWdyYXk6ICcyZjRmNGYnLFxuICAgIGRhcmtzbGF0ZWdyZXk6ICcyZjRmNGYnLFxuICAgIGRhcmt0dXJxdW9pc2U6ICcwMGNlZDEnLFxuICAgIGRhcmt2aW9sZXQ6ICc5NDAwZDMnLFxuICAgIGRlZXBwaW5rOiAnZmYxNDkzJyxcbiAgICBkZWVwc2t5Ymx1ZTogJzAwYmZmZicsXG4gICAgZGltZ3JheTogJzY5Njk2OScsXG4gICAgZGltZ3JleTogJzY5Njk2OScsXG4gICAgZG9kZ2VyYmx1ZTogJzFlOTBmZicsXG4gICAgZmlyZWJyaWNrOiAnYjIyMjIyJyxcbiAgICBmbG9yYWx3aGl0ZTogJ2ZmZmFmMCcsXG4gICAgZm9yZXN0Z3JlZW46ICcyMjhiMjInLFxuICAgIGZ1Y2hzaWE6ICdmMGYnLFxuICAgIGdhaW5zYm9ybzogJ2RjZGNkYycsXG4gICAgZ2hvc3R3aGl0ZTogJ2Y4ZjhmZicsXG4gICAgZ29sZDogJ2ZmZDcwMCcsXG4gICAgZ29sZGVucm9kOiAnZGFhNTIwJyxcbiAgICBncmF5OiAnODA4MDgwJyxcbiAgICBncmV5OiAnODA4MDgwJyxcbiAgICBncmVlbjogJzAwODAwMCcsXG4gICAgZ3JlZW55ZWxsb3c6ICdhZGZmMmYnLFxuICAgIGhvbmV5ZGV3OiAnZjBmZmYwJyxcbiAgICBob3RwaW5rOiAnZmY2OWI0JyxcbiAgICBpbmRpYW5yZWQ6ICdjZDVjNWMnLFxuICAgIGluZGlnbzogJzRiMDA4MicsXG4gICAgaXZvcnk6ICdmZmZmZjAnLFxuICAgIGtoYWtpOiAnZjBlNjhjJyxcbiAgICBsYXZlbmRlcjogJ2U2ZTZmYScsXG4gICAgbGF2ZW5kZXJibHVzaDogJ2ZmZjBmNScsXG4gICAgbGF3bmdyZWVuOiAnN2NmYzAwJyxcbiAgICBsZW1vbmNoaWZmb246ICdmZmZhY2QnLFxuICAgIGxpZ2h0Ymx1ZTogJ2FkZDhlNicsXG4gICAgbGlnaHRjb3JhbDogJ2YwODA4MCcsXG4gICAgbGlnaHRjeWFuOiAnZTBmZmZmJyxcbiAgICBsaWdodGdvbGRlbnJvZHllbGxvdzogJ2ZhZmFkMicsXG4gICAgbGlnaHRncmF5OiAnZDNkM2QzJyxcbiAgICBsaWdodGdyZXk6ICdkM2QzZDMnLFxuICAgIGxpZ2h0Z3JlZW46ICc5MGVlOTAnLFxuICAgIGxpZ2h0cGluazogJ2ZmYjZjMScsXG4gICAgbGlnaHRzYWxtb246ICdmZmEwN2EnLFxuICAgIGxpZ2h0c2VhZ3JlZW46ICcyMGIyYWEnLFxuICAgIGxpZ2h0c2t5Ymx1ZTogJzg3Y2VmYScsXG4gICAgbGlnaHRzbGF0ZWdyYXk6ICc3ODknLFxuICAgIGxpZ2h0c2xhdGVncmV5OiAnNzg5JyxcbiAgICBsaWdodHN0ZWVsYmx1ZTogJ2IwYzRkZScsXG4gICAgbGlnaHR5ZWxsb3c6ICdmZmZmZTAnLFxuICAgIGxpbWU6ICcwZjAnLFxuICAgIGxpbWVncmVlbjogJzMyY2QzMicsXG4gICAgbGluZW46ICdmYWYwZTYnLFxuICAgIG1hZ2VudGE6ICdmMGYnLFxuICAgIG1hcm9vbjogJzgwMDAwMCcsXG4gICAgbWVkaXVtYXF1YW1hcmluZTogJzY2Y2RhYScsXG4gICAgbWVkaXVtYmx1ZTogJzAwMDBjZCcsXG4gICAgbWVkaXVtb3JjaGlkOiAnYmE1NWQzJyxcbiAgICBtZWRpdW1wdXJwbGU6ICc5MzcwZDgnLFxuICAgIG1lZGl1bXNlYWdyZWVuOiAnM2NiMzcxJyxcbiAgICBtZWRpdW1zbGF0ZWJsdWU6ICc3YjY4ZWUnLFxuICAgIG1lZGl1bXNwcmluZ2dyZWVuOiAnMDBmYTlhJyxcbiAgICBtZWRpdW10dXJxdW9pc2U6ICc0OGQxY2MnLFxuICAgIG1lZGl1bXZpb2xldHJlZDogJ2M3MTU4NScsXG4gICAgbWlkbmlnaHRibHVlOiAnMTkxOTcwJyxcbiAgICBtaW50Y3JlYW06ICdmNWZmZmEnLFxuICAgIG1pc3R5cm9zZTogJ2ZmZTRlMScsXG4gICAgbW9jY2FzaW46ICdmZmU0YjUnLFxuICAgIG5hdmFqb3doaXRlOiAnZmZkZWFkJyxcbiAgICBuYXZ5OiAnMDAwMDgwJyxcbiAgICBvbGRsYWNlOiAnZmRmNWU2JyxcbiAgICBvbGl2ZTogJzgwODAwMCcsXG4gICAgb2xpdmVkcmFiOiAnNmI4ZTIzJyxcbiAgICBvcmFuZ2U6ICdmZmE1MDAnLFxuICAgIG9yYW5nZXJlZDogJ2ZmNDUwMCcsXG4gICAgb3JjaGlkOiAnZGE3MGQ2JyxcbiAgICBwYWxlZ29sZGVucm9kOiAnZWVlOGFhJyxcbiAgICBwYWxlZ3JlZW46ICc5OGZiOTgnLFxuICAgIHBhbGV0dXJxdW9pc2U6ICdhZmVlZWUnLFxuICAgIHBhbGV2aW9sZXRyZWQ6ICdkODcwOTMnLFxuICAgIHBhcGF5YXdoaXA6ICdmZmVmZDUnLFxuICAgIHBlYWNocHVmZjogJ2ZmZGFiOScsXG4gICAgcGVydTogJ2NkODUzZicsXG4gICAgcGluazogJ2ZmYzBjYicsXG4gICAgcGx1bTogJ2RkYTBkZCcsXG4gICAgcG93ZGVyYmx1ZTogJ2IwZTBlNicsXG4gICAgcHVycGxlOiAnODAwMDgwJyxcbiAgICByZWJlY2NhcHVycGxlOiAnNjM5JyxcbiAgICByZWQ6ICdmMDAnLFxuICAgIHJvc3licm93bjogJ2JjOGY4ZicsXG4gICAgcm95YWxibHVlOiAnNDE2OWUxJyxcbiAgICBzYWRkbGVicm93bjogJzhiNDUxMycsXG4gICAgc2FsbW9uOiAnZmE4MDcyJyxcbiAgICBzYW5keWJyb3duOiAnZjRhNDYwJyxcbiAgICBzZWFncmVlbjogJzJlOGI1NycsXG4gICAgc2Vhc2hlbGw6ICdmZmY1ZWUnLFxuICAgIHNpZW5uYTogJ2EwNTIyZCcsXG4gICAgc2lsdmVyOiAnYzBjMGMwJyxcbiAgICBza3libHVlOiAnODdjZWViJyxcbiAgICBzbGF0ZWJsdWU6ICc2YTVhY2QnLFxuICAgIHNsYXRlZ3JheTogJzcwODA5MCcsXG4gICAgc2xhdGVncmV5OiAnNzA4MDkwJyxcbiAgICBzbm93OiAnZmZmYWZhJyxcbiAgICBzcHJpbmdncmVlbjogJzAwZmY3ZicsXG4gICAgc3RlZWxibHVlOiAnNDY4MmI0JyxcbiAgICB0YW46ICdkMmI0OGMnLFxuICAgIHRlYWw6ICcwMDgwODAnLFxuICAgIHRoaXN0bGU6ICdkOGJmZDgnLFxuICAgIHRvbWF0bzogJ2ZmNjM0NycsXG4gICAgdHVycXVvaXNlOiAnNDBlMGQwJyxcbiAgICB2aW9sZXQ6ICdlZTgyZWUnLFxuICAgIHdoZWF0OiAnZjVkZWIzJyxcbiAgICB3aGl0ZTogJ2ZmZicsXG4gICAgd2hpdGVzbW9rZTogJ2Y1ZjVmNScsXG4gICAgeWVsbG93OiAnZmYwJyxcbiAgICB5ZWxsb3dncmVlbjogJzlhY2QzMidcbn07XG5cbi8qZ2xvYmFsIElOQ0xVREUsIGluc3RhbGxDb2xvclNwYWNlLCBPTkVDT0xPUiovXG5cbmluc3RhbGxDb2xvclNwYWNlKCdYWVonLCBbJ3gnLCAneScsICd6JywgJ2FscGhhJ10sIHtcbiAgICBmcm9tUmdiOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGh0dHA6Ly93d3cuZWFzeXJnYi5jb20vaW5kZXgucGhwP1g9TUFUSCZIPTAyI3RleHQyXG4gICAgICAgIHZhciBjb252ZXJ0ID0gZnVuY3Rpb24gKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hhbm5lbCA+IDAuMDQwNDUgP1xuICAgICAgICAgICAgICAgICAgICBNYXRoLnBvdygoY2hhbm5lbCArIDAuMDU1KSAvIDEuMDU1LCAyLjQpIDpcbiAgICAgICAgICAgICAgICAgICAgY2hhbm5lbCAvIDEyLjkyO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHIgPSBjb252ZXJ0KHRoaXMuX3JlZCksXG4gICAgICAgICAgICBnID0gY29udmVydCh0aGlzLl9ncmVlbiksXG4gICAgICAgICAgICBiID0gY29udmVydCh0aGlzLl9ibHVlKTtcblxuICAgICAgICAvLyBSZWZlcmVuY2Ugd2hpdGUgcG9pbnQgc1JHQiBENjU6XG4gICAgICAgIC8vIGh0dHA6Ly93d3cuYnJ1Y2VsaW5kYmxvb20uY29tL2luZGV4Lmh0bWw/RXFuX1JHQl9YWVpfTWF0cml4Lmh0bWxcbiAgICAgICAgcmV0dXJuIG5ldyBPTkVDT0xPUi5YWVooXG4gICAgICAgICAgICByICogMC40MTI0NTY0ICsgZyAqIDAuMzU3NTc2MSArIGIgKiAwLjE4MDQzNzUsXG4gICAgICAgICAgICByICogMC4yMTI2NzI5ICsgZyAqIDAuNzE1MTUyMiArIGIgKiAwLjA3MjE3NTAsXG4gICAgICAgICAgICByICogMC4wMTkzMzM5ICsgZyAqIDAuMTE5MTkyMCArIGIgKiAwLjk1MDMwNDEsXG4gICAgICAgICAgICB0aGlzLl9hbHBoYVxuICAgICAgICApO1xuICAgIH0sXG5cbiAgICByZ2I6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaHR0cDovL3d3dy5lYXN5cmdiLmNvbS9pbmRleC5waHA/WD1NQVRIJkg9MDEjdGV4dDFcbiAgICAgICAgdmFyIHggPSB0aGlzLl94LFxuICAgICAgICAgICAgeSA9IHRoaXMuX3ksXG4gICAgICAgICAgICB6ID0gdGhpcy5feixcbiAgICAgICAgICAgIGNvbnZlcnQgPSBmdW5jdGlvbiAoY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjaGFubmVsID4gMC4wMDMxMzA4ID9cbiAgICAgICAgICAgICAgICAgICAgMS4wNTUgKiBNYXRoLnBvdyhjaGFubmVsLCAxIC8gMi40KSAtIDAuMDU1IDpcbiAgICAgICAgICAgICAgICAgICAgMTIuOTIgKiBjaGFubmVsO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAvLyBSZWZlcmVuY2Ugd2hpdGUgcG9pbnQgc1JHQiBENjU6XG4gICAgICAgIC8vIGh0dHA6Ly93d3cuYnJ1Y2VsaW5kYmxvb20uY29tL2luZGV4Lmh0bWw/RXFuX1JHQl9YWVpfTWF0cml4Lmh0bWxcbiAgICAgICAgcmV0dXJuIG5ldyBPTkVDT0xPUi5SR0IoXG4gICAgICAgICAgICBjb252ZXJ0KHggKiAgMy4yNDA0NTQyICsgeSAqIC0xLjUzNzEzODUgKyB6ICogLTAuNDk4NTMxNCksXG4gICAgICAgICAgICBjb252ZXJ0KHggKiAtMC45NjkyNjYwICsgeSAqICAxLjg3NjAxMDggKyB6ICogIDAuMDQxNTU2MCksXG4gICAgICAgICAgICBjb252ZXJ0KHggKiAgMC4wNTU2NDM0ICsgeSAqIC0wLjIwNDAyNTkgKyB6ICogIDEuMDU3MjI1MiksXG4gICAgICAgICAgICB0aGlzLl9hbHBoYVxuICAgICAgICApO1xuICAgIH0sXG5cbiAgICBsYWI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaHR0cDovL3d3dy5lYXN5cmdiLmNvbS9pbmRleC5waHA/WD1NQVRIJkg9MDcjdGV4dDdcbiAgICAgICAgdmFyIGNvbnZlcnQgPSBmdW5jdGlvbiAoY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjaGFubmVsID4gMC4wMDg4NTYgP1xuICAgICAgICAgICAgICAgICAgICBNYXRoLnBvdyhjaGFubmVsLCAxIC8gMykgOlxuICAgICAgICAgICAgICAgICAgICA3Ljc4NzAzNyAqIGNoYW5uZWwgKyA0IC8gMjk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeCA9IGNvbnZlcnQodGhpcy5feCAvICA5NS4wNDcpLFxuICAgICAgICAgICAgeSA9IGNvbnZlcnQodGhpcy5feSAvIDEwMC4wMDApLFxuICAgICAgICAgICAgeiA9IGNvbnZlcnQodGhpcy5feiAvIDEwOC44ODMpO1xuXG4gICAgICAgIHJldHVybiBuZXcgT05FQ09MT1IuTEFCKFxuICAgICAgICAgICAgKDExNiAqIHkpIC0gMTYsXG4gICAgICAgICAgICA1MDAgKiAoeCAtIHkpLFxuICAgICAgICAgICAgMjAwICogKHkgLSB6KSxcbiAgICAgICAgICAgIHRoaXMuX2FscGhhXG4gICAgICAgICk7XG4gICAgfVxufSk7XG5cbi8qZ2xvYmFsIElOQ0xVREUsIGluc3RhbGxDb2xvclNwYWNlLCBPTkVDT0xPUiovXG5cbmluc3RhbGxDb2xvclNwYWNlKCdMQUInLCBbJ2wnLCAnYScsICdiJywgJ2FscGhhJ10sIHtcbiAgICBmcm9tUmdiOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnh5eigpLmxhYigpO1xuICAgIH0sXG5cbiAgICByZ2I6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMueHl6KCkucmdiKCk7XG4gICAgfSxcblxuICAgIHh5ejogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBodHRwOi8vd3d3LmVhc3lyZ2IuY29tL2luZGV4LnBocD9YPU1BVEgmSD0wOCN0ZXh0OFxuICAgICAgICB2YXIgY29udmVydCA9IGZ1bmN0aW9uIChjaGFubmVsKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvdyA9IE1hdGgucG93KGNoYW5uZWwsIDMpO1xuICAgICAgICAgICAgICAgIHJldHVybiBwb3cgPiAwLjAwODg1NiA/XG4gICAgICAgICAgICAgICAgICAgIHBvdyA6XG4gICAgICAgICAgICAgICAgICAgIChjaGFubmVsIC0gMTYgLyAxMTYpIC8gNy44NztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB5ID0gKHRoaXMuX2wgKyAxNikgLyAxMTYsXG4gICAgICAgICAgICB4ID0gdGhpcy5fYSAvIDUwMCArIHksXG4gICAgICAgICAgICB6ID0geSAtIHRoaXMuX2IgLyAyMDA7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBPTkVDT0xPUi5YWVooXG4gICAgICAgICAgICBjb252ZXJ0KHgpICogIDk1LjA0NyxcbiAgICAgICAgICAgIGNvbnZlcnQoeSkgKiAxMDAuMDAwLFxuICAgICAgICAgICAgY29udmVydCh6KSAqIDEwOC44ODMsXG4gICAgICAgICAgICB0aGlzLl9hbHBoYVxuICAgICAgICApO1xuICAgIH1cbn0pO1xuXG4vKmdsb2JhbCBvbmUqL1xuXG5pbnN0YWxsQ29sb3JTcGFjZSgnSFNWJywgWydodWUnLCAnc2F0dXJhdGlvbicsICd2YWx1ZScsICdhbHBoYSddLCB7XG4gICAgcmdiOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBodWUgPSB0aGlzLl9odWUsXG4gICAgICAgICAgICBzYXR1cmF0aW9uID0gdGhpcy5fc2F0dXJhdGlvbixcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5fdmFsdWUsXG4gICAgICAgICAgICBpID0gTWF0aC5taW4oNSwgTWF0aC5mbG9vcihodWUgKiA2KSksXG4gICAgICAgICAgICBmID0gaHVlICogNiAtIGksXG4gICAgICAgICAgICBwID0gdmFsdWUgKiAoMSAtIHNhdHVyYXRpb24pLFxuICAgICAgICAgICAgcSA9IHZhbHVlICogKDEgLSBmICogc2F0dXJhdGlvbiksXG4gICAgICAgICAgICB0ID0gdmFsdWUgKiAoMSAtICgxIC0gZikgKiBzYXR1cmF0aW9uKSxcbiAgICAgICAgICAgIHJlZCxcbiAgICAgICAgICAgIGdyZWVuLFxuICAgICAgICAgICAgYmx1ZTtcbiAgICAgICAgc3dpdGNoIChpKSB7XG4gICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgIHJlZCA9IHZhbHVlO1xuICAgICAgICAgICAgZ3JlZW4gPSB0O1xuICAgICAgICAgICAgYmx1ZSA9IHA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgcmVkID0gcTtcbiAgICAgICAgICAgIGdyZWVuID0gdmFsdWU7XG4gICAgICAgICAgICBibHVlID0gcDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICByZWQgPSBwO1xuICAgICAgICAgICAgZ3JlZW4gPSB2YWx1ZTtcbiAgICAgICAgICAgIGJsdWUgPSB0O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgIHJlZCA9IHA7XG4gICAgICAgICAgICBncmVlbiA9IHE7XG4gICAgICAgICAgICBibHVlID0gdmFsdWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgICAgcmVkID0gdDtcbiAgICAgICAgICAgIGdyZWVuID0gcDtcbiAgICAgICAgICAgIGJsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgICByZWQgPSB2YWx1ZTtcbiAgICAgICAgICAgIGdyZWVuID0gcDtcbiAgICAgICAgICAgIGJsdWUgPSBxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBPTkVDT0xPUi5SR0IocmVkLCBncmVlbiwgYmx1ZSwgdGhpcy5fYWxwaGEpO1xuICAgIH0sXG5cbiAgICBoc2w6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGwgPSAoMiAtIHRoaXMuX3NhdHVyYXRpb24pICogdGhpcy5fdmFsdWUsXG4gICAgICAgICAgICBzdiA9IHRoaXMuX3NhdHVyYXRpb24gKiB0aGlzLl92YWx1ZSxcbiAgICAgICAgICAgIHN2RGl2aXNvciA9IGwgPD0gMSA/IGwgOiAoMiAtIGwpLFxuICAgICAgICAgICAgc2F0dXJhdGlvbjtcblxuICAgICAgICAvLyBBdm9pZCBkaXZpc2lvbiBieSB6ZXJvIHdoZW4gbGlnaHRuZXNzIGFwcHJvYWNoZXMgemVybzpcbiAgICAgICAgaWYgKHN2RGl2aXNvciA8IDFlLTkpIHtcbiAgICAgICAgICAgIHNhdHVyYXRpb24gPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2F0dXJhdGlvbiA9IHN2IC8gc3ZEaXZpc29yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgT05FQ09MT1IuSFNMKHRoaXMuX2h1ZSwgc2F0dXJhdGlvbiwgbCAvIDIsIHRoaXMuX2FscGhhKTtcbiAgICB9LFxuXG4gICAgZnJvbVJnYjogZnVuY3Rpb24gKCkgeyAvLyBCZWNvbWVzIG9uZS5jb2xvci5SR0IucHJvdG90eXBlLmhzdlxuICAgICAgICB2YXIgcmVkID0gdGhpcy5fcmVkLFxuICAgICAgICAgICAgZ3JlZW4gPSB0aGlzLl9ncmVlbixcbiAgICAgICAgICAgIGJsdWUgPSB0aGlzLl9ibHVlLFxuICAgICAgICAgICAgbWF4ID0gTWF0aC5tYXgocmVkLCBncmVlbiwgYmx1ZSksXG4gICAgICAgICAgICBtaW4gPSBNYXRoLm1pbihyZWQsIGdyZWVuLCBibHVlKSxcbiAgICAgICAgICAgIGRlbHRhID0gbWF4IC0gbWluLFxuICAgICAgICAgICAgaHVlLFxuICAgICAgICAgICAgc2F0dXJhdGlvbiA9IChtYXggPT09IDApID8gMCA6IChkZWx0YSAvIG1heCksXG4gICAgICAgICAgICB2YWx1ZSA9IG1heDtcbiAgICAgICAgaWYgKGRlbHRhID09PSAwKSB7XG4gICAgICAgICAgICBodWUgPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3dpdGNoIChtYXgpIHtcbiAgICAgICAgICAgIGNhc2UgcmVkOlxuICAgICAgICAgICAgICAgIGh1ZSA9IChncmVlbiAtIGJsdWUpIC8gZGVsdGEgLyA2ICsgKGdyZWVuIDwgYmx1ZSA/IDEgOiAwKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ3JlZW46XG4gICAgICAgICAgICAgICAgaHVlID0gKGJsdWUgLSByZWQpIC8gZGVsdGEgLyA2ICsgMSAvIDM7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGJsdWU6XG4gICAgICAgICAgICAgICAgaHVlID0gKHJlZCAtIGdyZWVuKSAvIGRlbHRhIC8gNiArIDIgLyAzO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgT05FQ09MT1IuSFNWKGh1ZSwgc2F0dXJhdGlvbiwgdmFsdWUsIHRoaXMuX2FscGhhKTtcbiAgICB9XG59KTtcblxuLypnbG9iYWwgb25lKi9cblxuXG5pbnN0YWxsQ29sb3JTcGFjZSgnSFNMJywgWydodWUnLCAnc2F0dXJhdGlvbicsICdsaWdodG5lc3MnLCAnYWxwaGEnXSwge1xuICAgIGhzdjogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBBbGdvcml0aG0gYWRhcHRlZCBmcm9tIGh0dHA6Ly93aWtpLnNlY29uZGxpZmUuY29tL3dpa2kvQ29sb3JfY29udmVyc2lvbl9zY3JpcHRzXG4gICAgICAgIHZhciBsID0gdGhpcy5fbGlnaHRuZXNzICogMixcbiAgICAgICAgICAgIHMgPSB0aGlzLl9zYXR1cmF0aW9uICogKChsIDw9IDEpID8gbCA6IDIgLSBsKSxcbiAgICAgICAgICAgIHNhdHVyYXRpb247XG5cbiAgICAgICAgLy8gQXZvaWQgZGl2aXNpb24gYnkgemVybyB3aGVuIGwgKyBzIGlzIHZlcnkgc21hbGwgKGFwcHJvYWNoaW5nIGJsYWNrKTpcbiAgICAgICAgaWYgKGwgKyBzIDwgMWUtOSkge1xuICAgICAgICAgICAgc2F0dXJhdGlvbiA9IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzYXR1cmF0aW9uID0gKDIgKiBzKSAvIChsICsgcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IE9ORUNPTE9SLkhTVih0aGlzLl9odWUsIHNhdHVyYXRpb24sIChsICsgcykgLyAyLCB0aGlzLl9hbHBoYSk7XG4gICAgfSxcblxuICAgIHJnYjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5oc3YoKS5yZ2IoKTtcbiAgICB9LFxuXG4gICAgZnJvbVJnYjogZnVuY3Rpb24gKCkgeyAvLyBCZWNvbWVzIG9uZS5jb2xvci5SR0IucHJvdG90eXBlLmhzdlxuICAgICAgICByZXR1cm4gdGhpcy5oc3YoKS5oc2woKTtcbiAgICB9XG59KTtcblxuLypnbG9iYWwgb25lKi9cblxuaW5zdGFsbENvbG9yU3BhY2UoJ0NNWUsnLCBbJ2N5YW4nLCAnbWFnZW50YScsICd5ZWxsb3cnLCAnYmxhY2snLCAnYWxwaGEnXSwge1xuICAgIHJnYjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IE9ORUNPTE9SLlJHQigoMSAtIHRoaXMuX2N5YW4gKiAoMSAtIHRoaXMuX2JsYWNrKSAtIHRoaXMuX2JsYWNrKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICgxIC0gdGhpcy5fbWFnZW50YSAqICgxIC0gdGhpcy5fYmxhY2spIC0gdGhpcy5fYmxhY2spLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKDEgLSB0aGlzLl95ZWxsb3cgKiAoMSAtIHRoaXMuX2JsYWNrKSAtIHRoaXMuX2JsYWNrKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2FscGhhKTtcbiAgICB9LFxuXG4gICAgZnJvbVJnYjogZnVuY3Rpb24gKCkgeyAvLyBCZWNvbWVzIG9uZS5jb2xvci5SR0IucHJvdG90eXBlLmNteWtcbiAgICAgICAgLy8gQWRhcHRlZCBmcm9tIGh0dHA6Ly93d3cuamF2YXNjcmlwdGVyLm5ldC9mYXEvcmdiMmNteWsuaHRtXG4gICAgICAgIHZhciByZWQgPSB0aGlzLl9yZWQsXG4gICAgICAgICAgICBncmVlbiA9IHRoaXMuX2dyZWVuLFxuICAgICAgICAgICAgYmx1ZSA9IHRoaXMuX2JsdWUsXG4gICAgICAgICAgICBjeWFuID0gMSAtIHJlZCxcbiAgICAgICAgICAgIG1hZ2VudGEgPSAxIC0gZ3JlZW4sXG4gICAgICAgICAgICB5ZWxsb3cgPSAxIC0gYmx1ZSxcbiAgICAgICAgICAgIGJsYWNrID0gMTtcbiAgICAgICAgaWYgKHJlZCB8fCBncmVlbiB8fCBibHVlKSB7XG4gICAgICAgICAgICBibGFjayA9IE1hdGgubWluKGN5YW4sIE1hdGgubWluKG1hZ2VudGEsIHllbGxvdykpO1xuICAgICAgICAgICAgY3lhbiA9IChjeWFuIC0gYmxhY2spIC8gKDEgLSBibGFjayk7XG4gICAgICAgICAgICBtYWdlbnRhID0gKG1hZ2VudGEgLSBibGFjaykgLyAoMSAtIGJsYWNrKTtcbiAgICAgICAgICAgIHllbGxvdyA9ICh5ZWxsb3cgLSBibGFjaykgLyAoMSAtIGJsYWNrKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJsYWNrID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IE9ORUNPTE9SLkNNWUsoY3lhbiwgbWFnZW50YSwgeWVsbG93LCBibGFjaywgdGhpcy5fYWxwaGEpO1xuICAgIH1cbn0pO1xuXG5PTkVDT0xPUi5pbnN0YWxsTWV0aG9kKCdjbGVhcmVyJywgZnVuY3Rpb24gKGFtb3VudCkge1xuICAgIHJldHVybiB0aGlzLmFscGhhKGlzTmFOKGFtb3VudCkgPyAtMC4xIDogLWFtb3VudCwgdHJ1ZSk7XG59KTtcblxuXG5PTkVDT0xPUi5pbnN0YWxsTWV0aG9kKCdkYXJrZW4nLCBmdW5jdGlvbiAoYW1vdW50KSB7XG4gICAgcmV0dXJuIHRoaXMubGlnaHRuZXNzKGlzTmFOKGFtb3VudCkgPyAtMC4xIDogLWFtb3VudCwgdHJ1ZSk7XG59KTtcblxuXG5PTkVDT0xPUi5pbnN0YWxsTWV0aG9kKCdkZXNhdHVyYXRlJywgZnVuY3Rpb24gKGFtb3VudCkge1xuICAgIHJldHVybiB0aGlzLnNhdHVyYXRpb24oaXNOYU4oYW1vdW50KSA/IC0wLjEgOiAtYW1vdW50LCB0cnVlKTtcbn0pO1xuXG5mdW5jdGlvbiBncyAoKSB7XG4gICAgdmFyIHJnYiA9IHRoaXMucmdiKCksXG4gICAgICAgIHZhbCA9IHJnYi5fcmVkICogMC4zICsgcmdiLl9ncmVlbiAqIDAuNTkgKyByZ2IuX2JsdWUgKiAwLjExO1xuXG4gICAgcmV0dXJuIG5ldyBPTkVDT0xPUi5SR0IodmFsLCB2YWwsIHZhbCwgdGhpcy5fYWxwaGEpO1xufTtcblxuT05FQ09MT1IuaW5zdGFsbE1ldGhvZCgnZ3JleXNjYWxlJywgZ3MpO1xuT05FQ09MT1IuaW5zdGFsbE1ldGhvZCgnZ3JheXNjYWxlJywgZ3MpO1xuXG5cbk9ORUNPTE9SLmluc3RhbGxNZXRob2QoJ2xpZ2h0ZW4nLCBmdW5jdGlvbiAoYW1vdW50KSB7XG4gICAgcmV0dXJuIHRoaXMubGlnaHRuZXNzKGlzTmFOKGFtb3VudCkgPyAwLjEgOiBhbW91bnQsIHRydWUpO1xufSk7XG5cbk9ORUNPTE9SLmluc3RhbGxNZXRob2QoJ21peCcsIGZ1bmN0aW9uIChvdGhlckNvbG9yLCB3ZWlnaHQpIHtcbiAgICBvdGhlckNvbG9yID0gT05FQ09MT1Iob3RoZXJDb2xvcikucmdiKCk7XG4gICAgd2VpZ2h0ID0gMSAtIChpc05hTih3ZWlnaHQpID8gMC41IDogd2VpZ2h0KTtcblxuICAgIHZhciB3ID0gd2VpZ2h0ICogMiAtIDEsXG4gICAgICAgIGEgPSB0aGlzLl9hbHBoYSAtIG90aGVyQ29sb3IuX2FscGhhLFxuICAgICAgICB3ZWlnaHQxID0gKCgodyAqIGEgPT09IC0xKSA/IHcgOiAodyArIGEpIC8gKDEgKyB3ICogYSkpICsgMSkgLyAyLFxuICAgICAgICB3ZWlnaHQyID0gMSAtIHdlaWdodDEsXG4gICAgICAgIHJnYiA9IHRoaXMucmdiKCk7XG5cbiAgICByZXR1cm4gbmV3IE9ORUNPTE9SLlJHQihcbiAgICAgICAgcmdiLl9yZWQgKiB3ZWlnaHQxICsgb3RoZXJDb2xvci5fcmVkICogd2VpZ2h0MixcbiAgICAgICAgcmdiLl9ncmVlbiAqIHdlaWdodDEgKyBvdGhlckNvbG9yLl9ncmVlbiAqIHdlaWdodDIsXG4gICAgICAgIHJnYi5fYmx1ZSAqIHdlaWdodDEgKyBvdGhlckNvbG9yLl9ibHVlICogd2VpZ2h0MixcbiAgICAgICAgcmdiLl9hbHBoYSAqIHdlaWdodCArIG90aGVyQ29sb3IuX2FscGhhICogKDEgLSB3ZWlnaHQpXG4gICAgKTtcbn0pO1xuXG5PTkVDT0xPUi5pbnN0YWxsTWV0aG9kKCduZWdhdGUnLCBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJnYiA9IHRoaXMucmdiKCk7XG4gICAgcmV0dXJuIG5ldyBPTkVDT0xPUi5SR0IoMSAtIHJnYi5fcmVkLCAxIC0gcmdiLl9ncmVlbiwgMSAtIHJnYi5fYmx1ZSwgdGhpcy5fYWxwaGEpO1xufSk7XG5cbk9ORUNPTE9SLmluc3RhbGxNZXRob2QoJ29wYXF1ZXInLCBmdW5jdGlvbiAoYW1vdW50KSB7XG4gICAgcmV0dXJuIHRoaXMuYWxwaGEoaXNOYU4oYW1vdW50KSA/IDAuMSA6IGFtb3VudCwgdHJ1ZSk7XG59KTtcblxuT05FQ09MT1IuaW5zdGFsbE1ldGhvZCgncm90YXRlJywgZnVuY3Rpb24gKGRlZ3JlZXMpIHtcbiAgICByZXR1cm4gdGhpcy5odWUoKGRlZ3JlZXMgfHwgMCkgLyAzNjAsIHRydWUpO1xufSk7XG5cblxuT05FQ09MT1IuaW5zdGFsbE1ldGhvZCgnc2F0dXJhdGUnLCBmdW5jdGlvbiAoYW1vdW50KSB7XG4gICAgcmV0dXJuIHRoaXMuc2F0dXJhdGlvbihpc05hTihhbW91bnQpID8gMC4xIDogYW1vdW50LCB0cnVlKTtcbn0pO1xuXG4vLyBBZGFwdGVkIGZyb20gaHR0cDovL2dpbXAuc291cmNlYXJjaGl2ZS5jb20vZG9jdW1lbnRhdGlvbi8yLjYuNi0xdWJ1bnR1MS9jb2xvci10by1hbHBoYV84Yy1zb3VyY2UuaHRtbFxuLypcbiAgICB0b0FscGhhIHJldHVybnMgYSBjb2xvciB3aGVyZSB0aGUgdmFsdWVzIG9mIHRoZSBhcmd1bWVudCBoYXZlIGJlZW4gY29udmVydGVkIHRvIGFscGhhXG4qL1xuT05FQ09MT1IuaW5zdGFsbE1ldGhvZCgndG9BbHBoYScsIGZ1bmN0aW9uIChjb2xvcikge1xuICAgIHZhciBtZSA9IHRoaXMucmdiKCksXG4gICAgICAgIG90aGVyID0gT05FQ09MT1IoY29sb3IpLnJnYigpLFxuICAgICAgICBlcHNpbG9uID0gMWUtMTAsXG4gICAgICAgIGEgPSBuZXcgT05FQ09MT1IuUkdCKDAsIDAsIDAsIG1lLl9hbHBoYSksXG4gICAgICAgIGNoYW5uZWxzID0gWydfcmVkJywgJ19ncmVlbicsICdfYmx1ZSddO1xuXG4gICAgY2hhbm5lbHMuZm9yRWFjaChmdW5jdGlvbiAoY2hhbm5lbCkge1xuICAgICAgICBpZiAobWVbY2hhbm5lbF0gPCBlcHNpbG9uKSB7XG4gICAgICAgICAgICBhW2NoYW5uZWxdID0gbWVbY2hhbm5lbF07XG4gICAgICAgIH0gZWxzZSBpZiAobWVbY2hhbm5lbF0gPiBvdGhlcltjaGFubmVsXSkge1xuICAgICAgICAgICAgYVtjaGFubmVsXSA9IChtZVtjaGFubmVsXSAtIG90aGVyW2NoYW5uZWxdKSAvICgxIC0gb3RoZXJbY2hhbm5lbF0pO1xuICAgICAgICB9IGVsc2UgaWYgKG1lW2NoYW5uZWxdID4gb3RoZXJbY2hhbm5lbF0pIHtcbiAgICAgICAgICAgIGFbY2hhbm5lbF0gPSAob3RoZXJbY2hhbm5lbF0gLSBtZVtjaGFubmVsXSkgLyBvdGhlcltjaGFubmVsXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFbY2hhbm5lbF0gPSAwO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoYS5fcmVkID4gYS5fZ3JlZW4pIHtcbiAgICAgICAgaWYgKGEuX3JlZCA+IGEuX2JsdWUpIHtcbiAgICAgICAgICAgIG1lLl9hbHBoYSA9IGEuX3JlZDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1lLl9hbHBoYSA9IGEuX2JsdWU7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGEuX2dyZWVuID4gYS5fYmx1ZSkge1xuICAgICAgICBtZS5fYWxwaGEgPSBhLl9ncmVlbjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBtZS5fYWxwaGEgPSBhLl9ibHVlO1xuICAgIH1cblxuICAgIGlmIChtZS5fYWxwaGEgPCBlcHNpbG9uKSB7XG4gICAgICAgIHJldHVybiBtZTtcbiAgICB9XG5cbiAgICBjaGFubmVscy5mb3JFYWNoKGZ1bmN0aW9uIChjaGFubmVsKSB7XG4gICAgICAgIG1lW2NoYW5uZWxdID0gKG1lW2NoYW5uZWxdIC0gb3RoZXJbY2hhbm5lbF0pIC8gbWUuX2FscGhhICsgb3RoZXJbY2hhbm5lbF07XG4gICAgfSk7XG4gICAgbWUuX2FscGhhICo9IGEuX2FscGhhO1xuXG4gICAgcmV0dXJuIG1lO1xufSk7XG5cbi8qZ2xvYmFsIG9uZSovXG5cbi8vIFRoaXMgZmlsZSBpcyBwdXJlbHkgZm9yIHRoZSBidWlsZCBzeXN0ZW1cblxuLy8gT3JkZXIgaXMgaW1wb3J0YW50IHRvIHByZXZlbnQgY2hhbm5lbCBuYW1lIGNsYXNoZXMuIExhYiA8LT4gaHNMXG5cbi8vIENvbnZlbmllbmNlIGZ1bmN0aW9uc1xuXG4iXX0=
