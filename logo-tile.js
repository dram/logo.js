/*
Copyright (c) 2011, Xin Wang
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

    Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
    Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

"use strict"

/**
   Extend paper.PointText to add bounds support. Here we use a <span>
   to calculate text width and height.
*/
globals.Text = paper.PointText.extend({
    initialize: function (content, color) {
        color = color || '#333333'

        this.base()
        this.content = content
	this.characterStyle = {
	    font: 'Microsoft YaHei',
	    fontSize: 12,
	    fillColor: color
	}
    },

    _getBounds: function (getter, cacheName, args) {
	if (!globals.text_width_calculator) {
	    document.body.appendChild(document.createElement("br"))
	    var span = document.createElement("span")
	    span.style.font = "12pt Microsoft YaHei"
	    span.style.visibility = "hidden"
	    span.style.position = "absolute"
	    span.style.padding = "0"
	    span.style.width = "auto"
	    document.body.appendChild(span)
	    globals.text_width_calculator = span
	} else {
	    var span = globals.text_width_calculator
	}

        span.innerHTML = this.content

        var w = span.offsetWidth
        var h = span.offsetHeight

        var p = this.point
        var bounds = paper.Rectangle.create(p.x, p.y - h * 0.75, w, h)

        return getter == 'getBounds' ? this._createBounds(bounds) : bounds
    },

    set_position: function (pos) {
        this.position = pos.add([0, this.bounds.height * 0.75])
    },
})

/**
   Override paper.Group's hitTest function to only test hits for child
   HitGroup items.

   And this beheavior will be overrided by Tile.
*/
globals.HitGroup = paper.Group.extend({
    hitTest: function (point, options, matrix) {
        options = HitResult.getOptions(point, options)
        point = options.point

        if (this._children) {
            for (var i = this._children.length - 1; i >= 0; i--) {
                if (this._children[i] instanceof globals.HitGroup) {
                    var res = this._children[i].hitTest(point, options, matrix)
                    if (res) return res
                }
            }
        }

        return null
    },

    set_position: function (pos) {
        this.position = pos.add(this.bounds.size.divide(2))
    },

})

/**
   Tile base object, extended from HitGroup, so all tiles are groups.

   Every tile has an `expr' attribute to hold log expression relate to
   this tile.
*/
globals.Tile = globals.HitGroup.extend({
    initialize: function (expr) {
        this.base()
        this.expr = expr
    },

    SPACING: 12,

    /**
       label -- translate tile label
    */
    label: function (text) {
	if (globals.tile_labels && globals.tile_labels[text])
	    return globals.tile_labels[text]
	else
	    return text
    },

    /**
       hitTest -- hitTest function for Tile

       Test hit for children firstly, and then self.
    */
    hitTest: function (point, options, matrix) {
        options = HitResult.getOptions(point, options)
        point = options.point

	/* test for children */
	var children = this._children
	var result = null
        if (children) {
            for (var i = children.length - 1; i >= 0; i--) {
                if (children[i] instanceof globals.HitGroup
		    && (result = children[i].hitTest(point, options, matrix)))
		    break
            }
        }
	if (result)
	    return result

	/* test for self */
        var bounds = this.getBounds()

        var top_left = bounds.getTopLeft().transform(matrix)
        var bottom_right = bounds.getBottomRight().transform(matrix)

        if (point.x >= top_left.x
            && point.x <= bottom_right.x
            && point.y >= top_left.y
            && point.y <= bottom_right.y) {
            return new HitResult('center', this,
                                 { name: paper.Base.hyphenate('Center'),
                                   point: point })
        } else {
            return null
        }
    },

    /**
       add_child -- add a child tile and set parent_tile
    */
    add_child: function (item) {
	var res = this.addChild(item)
	item.parent_tile = this
	return res
    },

    /**
       has_child -- test if `tile' is a child of me
    */
    has_child: function (tile) {
	return this === tile.parent_tile
    },

    /**
       has_sibling -- test if `tile' is a sibling of me
    */
    has_sibling: function (tile) {
	return this.parent_tile === tile.parent_tile
    },

    /**
       get_parent -- return the parent tile
    */
    get_parent: function () {
	return this.parent_tile
    },

    /**
       get_parent_expr -- return expr of the parent tile
    */
    get_parent_expr: function () {
	return this.parent_tile.expr
    },

    /**
       set_background -- set background of a tile

       Insert a rectangle at the bottom of the tile to treat as a
       background.

       @color: color of the background
       @border: border size (both horizontal and vectical)
       @vect_border: vectical border size
    */
    set_background: function (color, border, vect_border) {
	var hb = typeof border === 'undefined' ? 0 : border
	var vb = typeof vect_border === 'undefined' ? hb : vect_border

        var point = new paper.Point(hb, vb)
        var size = new paper.Size(hb * 2, vb * 2)

        var bounds = this.bounds

        var rect = new paper.Path.Rectangle(
            bounds.point.subtract(point), bounds.size.add(size))

        rect.fillColor = color
        this.insertChild(0, rect)
    },

    /**
       delete_self -- try to remove self from parent tile
    */
    delete_self: function () {
	var parent = this.get_parent_expr()

	if (parent && parent.delete_child)
            return parent.delete_child(this.expr)
	else if (parent && parent.replace_child)
	    return parent.replace_child(this.expr, prototypes.nil.clone())
	else
	    return false
    },

    /**
       replace_self -- try to replace self with a new tile

       Delete self if `tile' is null
    */
    replace_self: function (tile) {
	if (!tile || !tile.expr)
	    return this.delete_self()

	/* parent and child can not be displaced */
	if (this.has_child(tile) || tile.has_child(this))
	    return false

	/*
	  Do not replace by a list, so that drag a tile to a list
	  will only move it to the list.
	*/
	if (tile.expr.type === 'LIST')
	    return this.delete_self()

	var parent = this.get_parent_expr()

	if (parent && parent.replace_child) {
	    return parent.replace_child(this.expr, tile.expr)
	} else {
	    return false
	}
    }
})

/**
   traits.Expr.tile -- create a tile of an expression

   Tile is hightlighted if it is the current running expression.
*/
Self.add_slot(traits.Expr, "tile", function () {
    var TileType = {
        'APPLY': globals.ApplyTile,
        'TO': globals.ToTile,
        'LIST': globals.ListTile,
        'NUMBER': globals.NumberTile,
        'NIL': globals.NilTile,
        'PAREN': globals.ParenTile,
        'VARIABLE': globals.VariableTile,
        'INFIX': globals.InfixTile
    }[this.type]

    var tile = new TileType(this)

    if (this === globals.current_expression) {
        var bounds = tile.bounds

        var border = new paper.Path.Rectangle(bounds.point, bounds.size)
        border.strokeColor = '#F37C78'
        border.strokeWidth = 3

        tile.add_child(border)
    }

    return tile
})

globals.NewToTile = globals.Tile.extend({
    initialize: function () {
        this.base()
        var name = new globals.Text(this.label('TO'), '#FFFFF')
        this.add_child(name)
        this.set_background('#F37C78', 5)
    },

    create_description_dialog: function () {
	var form, input

	form = document.createElement('form')
	form.id = "input-word-desc-dialog"
	form.visibility = "hidden"
	form.style.margin = "auto"
	form.style.left = "0"
	form.style.right = "0"
	form.style.top = "0"
	form.style.bottom = "0"
	form.style.position = "absolute"
	form.style.width = "200px"
	form.style.height = "80px"
	form.style.color = "#333333"
	form.style.border = "#F7F9FE 5px solid"
	form.style.background = "#DCE8EB"
	form.style.padding = "10px"
	form.style.textAlign = "center"

	input = document.createElement('input')
	input.name = "desciption"
	input.style.margin = "10px"
	input.style.width = "180px"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "submit"
	input.value = this.label('OK')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "button"
	input.value = this.label('Cancel')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	input.onclick = function () {
	     this.parentNode.style.visibility = 'hidden'
	}
	form.appendChild(input)

	document.body.appendChild(form)
	return form
    },

    click_cb: function () {
        var form

	if (!(form = document.getElementById('input-word-desc-dialog')))
	    form = this.create_description_dialog()

        var input = form.elements['desciption']

        input.value = this.label("name arg1 arg2")
        form.style.visibility = 'visible'

        form.onsubmit = function () {
            var content = input.value

            if (!content)
                return false

            var items = content.split(/\s+/)
            if (items.length < 1)
                return false

            var expr = prototypes.expr_to.clone(items[0])
            expr.arg_names = items.slice(1).map(function (arg) {
                return ':' + arg
            })

            var exprs = globals.expressions

            var i = 0
            for (; i < exprs.length; ++i) {
                if (exprs[i].type != 'TO'
                    || exprs[i].name == globals.main_word_name)
                    break
            }
            exprs.splice(i, 0, expr)

            form.style.visibility = 'hidden'
            document.activeElement.blur()
            globals.source_canvas.redraw()
            paper.view.draw()

            return false
        }

        input.focus()
        input.select()
    }
})

globals.ProtoTile = globals.Tile.extend({
    initialize: function (expr, color) {
        this.base(expr)
        this.color = color

        var label = null
        switch (expr.type) {
        case 'APPLY':
            label = expr.name
            break
        case 'LIST':
            label = this.label('list')
            break
        case 'NUMBER':
            label = this.label('number')
            break
        case 'INFIX':
            label = this.label(expr.op)
            break
        case 'TO':
            label = this.label('TO')
            break
        }

        var name = new globals.Text(label)

        this.add_child(name)

        color = color || '#CBDBE0'
        this.set_background(color, 5)
    },

    drop_cb: function (overlap) {
    },
})

globals.UserWordTile = globals.ProtoTile.extend({
    click_cb: function () {
        if (this.expr.type == 'APPLY') {
            var  words = globals.user_defined_words

            for (var i = 0; i < words.length; ++i) {
                var to_expr = words[i]

                if (to_expr.name == this.expr.name)
                    to_expr.hide = !to_expr.hide
            }
        }
    }
})

globals.RunTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('start'), '#FFFFFF')

        this.add_child(label)

        this.set_background('#F37C78', 5)
    },

    click_cb: function (expr) {
        var layer = globals.drawing_layer
        layer.removeChildren()
        layer.activate()

        globals.init_drawing_area()
        globals.running = true
        globals.lang.run_expr(globals.expressions, globals.logger)
        paper.project.layers[0].activate()
    },
})

globals.StopTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('stop'), '#FFFFFF')

        this.add_child(label)

        this.set_background('#F37C78', 5)
    },

    click_cb: function (expr) {
        var layer = globals.drawing_layer
        layer.removeChildren()
        layer.activate()

        globals.running = false
        globals.init_drawing_area()
        paper.project.layers[0].activate()
    },
})

globals.PauseTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('pause'), '#FFFFFF')

        this.add_child(label)

        this.set_background('#F37C78', 5)
    },

    click_cb: function (expr) {
        globals.paused = !globals.paused
    },
})

globals.ContinueTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('continue'), '#FFFFFF')

        this.add_child(label)

        this.set_background('#F37C78', 5)
    },

    click_cb: function (expr) {
        globals.paused = !globals.paused
    },
})

globals.StepTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('step'), '#FFFFFF')

        this.add_child(label)

        this.set_background('#F37C78', 5)
    },

    click_cb: function (expr) {
        var layer = globals.drawing_layer
        if (globals.running) {
            layer.activate()

            globals.lang.step()
        } else {
            layer.removeChildren()
            layer.activate()

            globals.init_drawing_area()
            globals.running = true
            globals.paused = true
            globals.lang.run_expr(globals.expressions, globals.logger)
        }

        paper.project.layers[0].activate()
    },
})

globals.SpeedTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var x = 0

        var num = globals.steps.tile()
        num.translate(x, 0)
        x += num.bounds.width + 5
        this.add_child(num)

        var label = new globals.Text(this.label('step(s) per second'))
        label.translate(x, 0)
        this.add_child(label)

        this.set_background('#CBDBE0', 5)
    },
})

globals.NumberTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text(expr.value.toString(), '#C1CC25'))
        this.set_background('#F7F9FE', 1)
    },

    overlap_cb: function (tile) {
        return this.replace_self(tile)
    },

    drop_cb: function (overlap) {
	return this.replace_self(overlap)
    },

    create_input_dialog: function () {
	var form, input

	form = document.createElement('form')
	form.id = "input-num-dialog"
	form.visibility = "hidden"
	form.style.margin = "auto"
	form.style.left = "0"
	form.style.right = "0"
	form.style.top = "0"
	form.style.bottom = "0"
	form.style.position = "absolute"
	form.style.width = "200px"
	form.style.height = "80px"
	form.style.color = "#333333"
	form.style.border = "#F7F9FE 5px solid"
	form.style.background = "#DCE8EB"
	form.style.padding = "10px"
	form.style.textAlign = "center"

	input = document.createElement('input')
	input.name = "value"
	input.style.margin = "10px"
	input.style.width = "180px"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "submit"
	input.value = this.label('OK')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "button"
	input.value = this.label('Cancel')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	input.onclick = function () {
	     this.parentNode.style.visibility = 'hidden'
	}
	form.appendChild(input)

	document.body.appendChild(form)
	return form
    },

    click_cb: function () {
        var form

	if (!(form = document.getElementById('input-num-dialog')))
	    form = this.create_input_dialog()

        var input = form.elements['value']

        input.value = this.expr.value
        form.style.visibility = 'visible'
        console.log(this.expr.value)

        var expr = this.expr

        form.onsubmit = function () {
            var value = input.value
            if (!value)
                return false
            expr.value = parseInt(value, 10)
            form.style.visibility = 'hidden'
            document.activeElement.blur()
            globals.source_canvas.redraw()
            paper.view.draw()

            return false
        }

        input.focus()
        input.select()
    },
})

globals.ListTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var y = 0

        for (var i = 0; i < expr.data.length; ++i) {
            var p = expr.data[i].tile()
            p.set_position(new paper.Point(0, y))
            y += p.bounds.height + this.SPACING
            this.add_child(p)
        }

        var blank = new paper.Path.Rectangle(
            new paper.Point(0, 0), new paper.Size(80, 10))
        blank.fillColor = '#DCE8EB'
        blank.translate(
            blank.bounds.size.divide(2).add(new paper.Point(0, y)))
        this.add_child(blank)

	if (expr.parent.type == 'LIST')
            this.set_background('#F7F9FE', 5)
	else
            this.set_background('#DCE8EB', 5)
    },

    drop_cb: function (overlap) {
	return this.replace_self(overlap)
    },

    overlap_cb: function (tile) {
        if (this.has_child(tile))
            return

        tile.expr.parent = this.expr

        this.expr.data.push(tile.expr.clone())
    },
})

globals.ApplyTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var name = new globals.Text(expr.name)

        this.add_child(name)

        var x = 0

        name.set_position(new paper.Point(x, 5))

        x += name.bounds.width + this.SPACING

        for (var i = 0; i < expr.args.length; ++i) {
            var p = expr.args[i].tile()
            p.set_background('#F7F9FE', 5)
            p.set_position(new paper.Point(x, 0))
            x += p.bounds.width + this.SPACING
            this.add_child(p)
        }

        this.set_background('#CBDBE0', 5)
    },

    overlap_cb: function (tile) {
        return this.replace_self(tile)
    },

    drop_cb: function (overlap) {
	return this.replace_self(overlap)
    }
})

globals.ToVariableTile = globals.Tile.extend({
    initialize: function (name) {
        this.base(prototypes.variable.clone(name))
        this.add_child(new globals.Text(name, '#91897E'))
        this.set_background('#F7F9FE', 5)
    },
})

/**
   Word name tile
 */
globals.ToNameTile = globals.Tile.extend({
    initialize: function (to_expr) {
        var name = to_expr.name

        var expr = prototypes.expr_apply.clone(name)
        for (var i = 0, l = to_expr.arg_names.length; i < l; ++i) {
            var nil = prototypes.nil.clone()
            nil.parent = expr
            expr.args.push(nil)
        }

        this.base(expr)

        this.add_child(new globals.Text(name))
        this.set_background('#F7F9FE', 5)
    },

    /**
       Click on name of a word definition tile will open a dialog to
       change word arguemnt names.
     */
    click_cb: function () {
        var form

	if (!(form = document.getElementById('input-word-desc-dialog')))
	    form = globals.NewToTile.prototype.create_description_dialog()
        var input = form.elements['desciption']

        form.style.visibility = 'visible'

        var expr = this.get_parent_expr()
        input.value = expr.name
        for (var i = 0, l = expr.arg_names.length; i < l; ++i)
            input.value += ' ' + expr.arg_names[i].slice(1)
        input.focus()
        input.select()

        form.onsubmit = function () {
            var content = input.value

            if (!content)
                return false

            var items = content.split(/\s+/)
            if (items.length < 1)
                return false

            expr.name = items[0]
            expr.arg_names = items.slice(1).map(function (arg) {
                return ':' + arg
            })

            form.style.visibility = 'hidden'
            document.activeElement.blur()
            globals.source_canvas.redraw()
            paper.view.draw()

            return false
        }
    }
})

/**
   ToDeleteTile is a delete button used in word definition tile. When
   it is clicked, the word definition it belongs to will be deleted.
 */
globals.ToDeleteTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text('x', '#F37C78'))
        this.set_background('#F7F9FE', 6, 0)
    },

    click_cb: function () {
        var index = globals.expressions.indexOf(this.expr)

        if (index != -1)
            globals.expressions.splice(index, 1)
    }
})

globals.ToTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var x = 0

        if (expr.name != globals.main_word_name) {
            var to = new globals.Text(this.label('TO'), "#91897E")

            to.set_position(new paper.Point(x, 5))

            this.add_child(to)

            x += to.bounds.width + this.SPACING

            var name = new globals.ToNameTile(expr)
            name.set_position(new paper.Point(x, 0))
            this.add_child(name)

            x += name.bounds.width + this.SPACING * 2
        }

        for (var i = 0; i < expr.arg_names.length; ++i) {
            var t = new globals.ToVariableTile(expr.arg_names[i])
            t.set_position(new paper.Point(x, 0))

            x += t.bounds.width + this.SPACING
            this.add_child(t)
        }

        var b = this.bounds
        var p = expr.block.tile()
        p.set_position(new paper.Point(this.SPACING * 2,
				       b.y + b.height + this.SPACING))
        this.add_child(p)

        if (expr.name != globals.main_word_name) {
            var del = new globals.ToDeleteTile(expr)
            del.set_position(new paper.Point(
                Math.max(this.bounds.width - 20, x), 5))
            this.add_child(del)
        }

        if (expr.name != globals.main_word_name) {
            this.set_background('#ECF1F2', 5)
        }
    },
})

globals.VariableTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text(expr.name.toString(), '#91897E'))
        this.set_background('#F7F9FE')
    },

    drop_cb: function (overlap) {
	return this.replace_self(overlap)
    },

    overlap_cb: function (tile) {
        return this.replace_self(tile)
    },

})

globals.NilTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text('???', '#F37C78'))
        this.set_background('#F7F9FE')
    },

    overlap_cb: function (tile) {
        return this.replace_self(tile)
    },

    drop_cb: function (overlap) {
	return this.replace_self(overlap)
    }
})

globals.ParenTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(expr.expr.tile())
    },
})

globals.InfixTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var x = 0

        var left = expr.left.tile()
        left.set_background('#F7F9FE', 5)
        left.set_position(new paper.Point(x, 0))
        this.add_child(left)

        x += left.bounds.width + this.SPACING

        var op = new globals.Text(expr.op.toString(), '#91897E')
        op.set_position(new paper.Point(x, 5))
        this.add_child(op)

        x += op.bounds.width + this.SPACING

        var right = expr.right.tile()
        right.set_background('#F7F9FE', 5)
        right.set_position(new paper.Point(x, 0))
        this.add_child(right)

        this.set_background('#CBDBE0', 5)
    },

    drop_cb: function (overlap) {
	return this.replace_self(overlap)
    },

    overlap_cb: function (tile) {
        return this.replace_self(tile)
    },
})

globals.ControllerPanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        this.removeChildren()
        var tile = null

        var x = 0
        var running = globals.running
        var paused = globals.paused

        if (!running) {
            tile = new globals.SpeedTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20

            tile = new globals.RunTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (running) {
            tile = new globals.StopTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (running && !paused) {
            tile = new globals.PauseTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (running && paused) {
            tile = new globals.ContinueTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (!running || (running && paused)) {
            tile = new globals.StepTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        this.translate(globals.canvas.width / 2 - this.bounds.width / 2,
                       globals.canvas.height - this.bounds.height + 20)
    },
})

globals.PrototypePanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        var that = this
        this.removeChildren()

        var expr = null
        var tile = null

        var y = 0

        tile = new globals.NewToTile()
        tile.translate(0, y)
        this.add_child(tile)
        y += tile.bounds.height + 30

        var ops = ['+', '-', '*', '/']
        var x = 0
        for (var i = 0; i < ops.length; ++i) {
            expr = prototypes.expr_infix.clone(ops[i])
            var nil = prototypes.number.clone(0)
            nil.parent = expr
            expr.left = nil
            var nil = prototypes.number.clone(0)
            nil.parent = expr
            expr.right = nil
            tile = new globals.ProtoTile(expr)
            tile.translate(x, y)
            x = (tile.bounds.width + 5) * ((i + 1) % 2)
            y += (tile.bounds.height + 5) * (i % 2)
            this.add_child(tile)
        }
        y += 5

        tile = new globals.ProtoTile(prototypes.number.clone(0))
        tile.translate(0, y)
        y += tile.bounds.height + 10
        this.add_child(tile)


        tile = new globals.ProtoTile(prototypes.list.clone(0))
        tile.translate(0, y)
        y += tile.bounds.height + 10
        this.add_child(tile)

        var words = [ [this.label('forward'), [prototypes.number.clone(0)]]
		      , [this.label('right'), [prototypes.number.clone(0)]]
		      , [this.label('repeat'), [prototypes.number.clone(0), prototypes.list.clone(0)]]
		      , [this.label('penup'), []]
		      , [this.label('pendown'), []]
		    ]
        words.forEach(function (arg) {
            var name = arg[0]
            var args = arg[1]
            expr = prototypes.expr_apply.clone(name)
            for (var i = 0; i < args.length; ++i) {
                args[i].parent = expr
                expr.args.push(args[i])
            }
            tile = new globals.ProtoTile(expr)
            tile.translate(0, y)
            y += tile.bounds.height + 10
            that.add_child(tile)
        })

        this.translate(new paper.Point(- this.bounds.x, 0))
        this.translate(globals.canvas.width - this.bounds.width, 50)
    },
})

globals.UserWordPanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        var that = this
        this.removeChildren()

        var y = 0

        globals.user_defined_words = []

        globals.expressions.forEach (function (to_expr) {
            if (to_expr.type != 'TO')
                return

            globals.user_defined_words.push(to_expr)

            if (to_expr.name === globals.main_word_name)
                return

            var expr = prototypes.expr_apply.clone(to_expr.name)
            for (var i = 0; i < to_expr.arg_names.length; ++i) {
                var nil = prototypes.nil.clone()
                nil.parent = expr
                expr.args.push(nil)
            }
            var tile = new globals.UserWordTile(expr, '#C1CC25')
            tile.translate(0, y)
            y += tile.bounds.height + 10
            if (to_expr.hide)
                tile.opacity = 0.6
            that.add_child(tile)
        })

        this.translate(new paper.Point(- this.bounds.x, 0))
        this.translate(new paper.Point(
	    globals.prototype_panel.bounds.x - this.bounds.width - 10,
	    115))
    },
})

globals.SourcePanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        var that = this
        this.removeChildren()

        var y = 20

        globals.expressions.forEach (function (expr) {
            if (expr.type != 'TO' || expr.hide)
                return

            var path = expr.tile()
            path.translate(new paper.Point(- path.bounds.x, y))
            that.add_child(path)
            y += path.bounds.height + 30
        })

        this.translate(new paper.Point(- this.bounds.x, 0))
        this.translate(new paper.Point(
            globals.user_word_panel.bounds.x - this.bounds.width - 30, 0))
    },
})

traits.SourceCanvas = Self.trait([], {
    on_mouse_down: function (event) {
        var that = globals.source_canvas

        var res = paper.project.hitTest(event.point, {
            stroke: true,
            fill: true,
            tolerance: 0
        })

        var expr
        if (res && res.type == 'center' && res.item
                && (expr = res.item.expr)
                && ((expr.parent && expr.parent.type != 'TO')
                   || res.item instanceof globals.ProtoTile
                   || res.item instanceof globals.ToVariableTile
                   || res.item instanceof globals.ToNameTile)) {
            that.do_move = true
            that.selected_tile = res.item

            if (res.item.down_cb)
                res.item.down_cb()
        } else {
            that.do_move = false
            that.selected_tile = null
        }

        that.dragged = false
    },

    on_mouse_drag: function (event) {
        var that = globals.source_canvas

        that.dragged = true

        if (!that.do_move)
            return

        that.drag_layer.activate()

        if (that.selected_tile instanceof globals.ProtoTile
           && !that.selected_tile.duplicate) {
            var obj = new globals.ProtoTile(
                that.selected_tile.expr, that.selected_tile.color)
            obj.position = event.point
            obj.duplicate = true
            that.selected_tile = obj
        }

        var group = that.selected_tile

        that.drag_layer.addChild(group)

        if (group.drag_cb)
            group.drag_cb()

        group.position = group.position.add(event.delta)
        group.opacity = 0.5
    },

    on_mouse_up: function (event) {
        var that = globals.source_canvas

        that.main_layer.activate()

        var res = that.main_layer.hitTest(event.point, {
            stroke: true,
            fill: true,
            tolerance: 0
        })

        var overlap = null
        if (res && res.type == 'center' && res.item)
            overlap = res.item

        if (!that.dragged) {
            if (overlap && overlap.click_cb) {
                overlap.click_cb()
                that.redraw()
            }
        }

        if (!that.do_move)
            return

        var tile = that.selected_tile

        if (tile.drop_cb && tile !== overlap)
            tile.drop_cb(overlap)

        if (overlap && overlap.overlap_cb && tile !== overlap)
            overlap.overlap_cb(tile)

        that.redraw()

    },

    on_key_down: function (event) {
        if (document.activeElement !== document.body) {
            return
        }

        switch (event.key) {
        case 'enter':
            globals.RunTile.prototype.click_cb()
            break
        }
    },

    on_mouse_move: function (event) {
        var that = globals.source_canvas

        var res = that.main_layer.hitTest(event.point, {
            stroke: true,
            fill: true,
            tolerance: 0
        })

        var tile = null
        if (res && res.type == 'center' && res.item)
            tile = res.item

	if (tile && tile.click_cb) {
	    document.body.style.cursor = 'pointer'
        } else if (tile && tile.drop_cb) {
	    document.body.style.cursor = 'move'
        } else {
	    document.body.style.cursor = 'default'
	}
    },

    on_frame: function (event) {
        globals.time_passed += event.delta

        if (globals.steps && globals.running && !globals.paused) {
            var steps = globals.steps.value
            if (globals.time_passed > 1 / steps) {
                globals.drawing_layer.activate()
                if (!globals.lang.step()) {
                    globals.running = false
                    globals.paused = false
                    globals.source_canvas.redraw()
                } else {
                    globals.running = true
                }
                globals.source_panel.redraw()
                paper.project.layers[0].activate()
                globals.time_passed = 0
            }
        }
    },

    clone: function () {
        var obj = Self.clone(this)

        return obj
    },

    redraw: function () {
        globals.source_canvas.drag_layer.removeChildren()

        globals.controller_panel.redraw()

        globals.user_word_panel.redraw()

        globals.source_panel.redraw()
    },

    draw_source: function () {
        if (!globals.expressions) {
            var source = globals.sample
            var tokens = globals.lang.tokenize(source)
            var exprs = globals.lang.parse(tokens)
            globals.expressions = exprs

            for (var i = 0; i < exprs.length; ++i) {
                /* got main word name here */
                if (exprs[i].type == 'APPLY')
                    globals.main_word_name = exprs[i].name
            }
        }

        globals.canvas = document.getElementById("canvas")

        globals.canvas.width = window.innerWidth - 30
        globals.canvas.height = window.innerHeight - 30

        paper.setup(globals.canvas)

        var tool = new paper.Tool()

        tool.onMouseDown = this.on_mouse_down
        tool.onMouseDrag = this.on_mouse_drag
        tool.onMouseUp = this.on_mouse_up
	tool.onMouseMove = this.on_mouse_move
        tool.onKeyDown = this.on_key_down
        paper.view.onFrame = this.on_frame


        globals.steps = prototypes.number.clone(3)

        globals.time_passed = 0

        globals.prototype_panel = new globals.PrototypePanel()
        globals.user_word_panel = new globals.UserWordPanel()
        globals.source_panel = new globals.SourcePanel()
        globals.controller_panel = new globals.ControllerPanel()

        if (paper.project.layers.length < 2)
            new paper.Layer()

        if (paper.project.layers.length < 3)
            new paper.Layer()

        this.main_layer = paper.project.layers[0]
        this.drag_layer = paper.project.layers[1]
        globals.drawing_layer = paper.project.layers[2]

        this.redraw()

        paper.view.draw()
    },
})

prototypes.source_canvas = Self.prototype(traits.SourceCanvas, {
    do_move: false,
    selected_tile: null,
    drag_layer: null,
    main_layer: null
})

globals.source_canvas = prototypes.source_canvas.clone()
