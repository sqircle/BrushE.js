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
