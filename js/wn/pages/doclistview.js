// Copyright (c) 2012 Web Notes Technologies Pvt Ltd (http://erpnext.com)
// 
// MIT License (MIT)
// 
// Permission is hereby granted, free of charge, to any person obtaining a 
// copy of this software and associated documentation files (the "Software"), 
// to deal in the Software without restriction, including without limitation 
// the rights to use, copy, modify, merge, publish, distribute, sublicense, 
// and/or sell copies of the Software, and to permit persons to whom the 
// Software is furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in 
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT 
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF 
// CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE 
// OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// 

wn.provide('wn.pages.doclistview');
wn.provide('wn.doclistviews');

wn.pages.doclistview.pages = {};
wn.pages.doclistview.show = function(doctype) {
	var pagename = doctype + ' List';
	var page = wn.pages.doclistview.pages[pagename];
	if(!page) {
		var page = page_body.add_page(pagename);
		page.doclistview = new wn.pages.DocListView(doctype, page);
		wn.pages.doclistview.pages[pagename] = page;
	}
	
	document.title = page.doclistview.label;
	page_body.change_to(pagename);
}

wn.pages.DocListView = wn.ui.Listing.extend({
	init: function(doctype, page) {
		this.doctype = get_label_doctype(doctype);
		this.$page = $(page);
		this.label = get_doctype_label(doctype);
		this.label = (this.label.toLowerCase().substr(-4) == 'list') ?
		 	this.label : (this.label + ' List');
		this.make_page();
		this.load_doctype();
	},
	
	make_page: function() {
		var me = this;
		this.$page.html(repl('<div class="layout-wrapper layout-wrapper-background">\
			<div class="layout-main-section">\
				<a class="close" onclick="window.history.back();">&times;</a>\
				<h1>%(label)s</h1>\
				<hr>\
				<div class="wnlist-area"><div class="help">Loading...</div></div>\
			</div>\
			<div class="layout-side-section">\
				<div class="stat-wrapper show-docstatus hide">\
					<h4>Show</h4>\
					<div><input data-docstatus="0" type="checkbox" checked="checked" /> Drafts</div>\
					<div><input data-docstatus="1" type="checkbox" checked="checked" /> Submitted</div>\
					<div><input data-docstatus="2" type="checkbox" /> Cancelled</div>\
				</div>\
			</div>\
			<div style="clear: both"></div>\
		</div>', {label: this.label}));
	},

	load_doctype: function() {
		var me = this;
		wn.call({
			method: 'webnotes.widgets.form.load.getdoctype',
			args: {doctype: me.doctype},
			callback: function() {
				me.can_delete = wn.model.can_delete(me.doctype);
				me.meta = locals.DocType[me.doctype];
				me.$page.find('.wnlist-area').empty(),
				me.setup_docstatus_filter();
				me.setup_listview();
				me.init_list();
				me.init_stats();
				me.add_delete_option();
			}
		});
	},
	setup_docstatus_filter: function() {
		var me = this;
		this.can_submit = $.map(locals.DocPerm, function(d) { 
			if(d.parent==me.meta.name && d.submit) return 1
			else return null; 
		}).length;
		if(this.can_submit) {
			this.$page.find('.show-docstatus').removeClass('hide');
			this.$page.find('.show-docstatus input').click(function() {
				me.run();
			})
		}
	},
	setup_listview: function() {
		if(this.meta.__listjs) {
			eval(this.meta.__listjs);
			this.listview = new wn.doclistviews[this.doctype](this);
		} else {
			this.listview = new wn.pages.ListView(this);
		}
		this.listview.parent = this;
	},
	init_list: function() {
		// init list
		this.make({
			method: 'webnotes.widgets.doclistview.get',
			get_args: this.get_args,
			parent: this.$page.find('.wnlist-area'),
			start: 0,
			page_length: 20,
			show_filters: true,
			show_grid: true,
			new_doctype: this.doctype,
			allow_delete: true,
			columns: this.listview.fields
		});
		this.run();
	},
	render_row: function(row, data) {
		data.doctype = this.doctype;
		this.listview.render(row, data, this);
	},	
	get_query_fields: function() {
		return this.listview.fields;
	},
	get_args: function() {
		return {
			doctype: this.doctype,
			fields: this.get_query_fields(),
			filters: this.filter_list.get_filters(),
			docstatus: this.can_submit ? $.map(this.$page.find('.show-docstatus :checked'), 
				function(inp) { return $(inp).attr('data-docstatus') }) : []
		}
	},
	add_delete_option: function() {
		var me = this;
		if(this.can_delete) {
			this.add_button('<a class="btn btn-small btn-delete">\
				<i class="icon-remove"></i> Delete</a>', 
					function() { me.delete_items(); },'.btn-filter')
		}
	},
	delete_items: function() {
		var me = this;				
		var dl = $.map(me.$page.find('.list-check :checked'), function(e) {
			return $(e).data('name');
		});
		if(!dl.length) 
			return;
		if(!confirm('This is PERMANENT action and you cannot undo. Continue?')) {
			return;
		}
		
		me.set_working(true);
		wn.call({
			method: 'webnotes.widgets.doclistview.delete_items',
			args: {
				items: dl,
				doctype: me.doctype
			},
			callback: function() {
				me.set_working(false);
				me.refresh();
			}
		})
	},
	init_stats: function() {
		var me = this
		wn.call({
			method: 'webnotes.widgets.doclistview.get_stats',
			args: {
				stats: me.listview.stats,
				doctype: me.doctype
			},
			callback: function(r) {
				$.each(r.message, function(field, stat) {
					me.render_stat(field, stat);
				});
			}
		});
	},
	render_stat: function(field, stat) {
		var me = this;
		
		if(!stat || !stat.length) {
			if(field=='_user_tags') {
				this.$page.find('.layout-side-section')
					.append('<div class="stat-wrapper"><h4>Tags</h4>\
						<div class="help"><i>No records tagged.</i><br><br> \
						To add a tag, open the document and click on \
						"Add Tag" on the sidebar</div></div>');
			}
			return;
		}
		
		var label = fields[this.doctype][field] ? fields[this.doctype][field].label : field;
		if(label=='_user_tags') label = 'Tags';
		
		// grid
		var $w = $('<div class="stat-wrapper">\
			<h4>'+ label +'</h4>\
			<div class="stat-grid">\
			</div>\
		</div>');
		
		// sort items
		stat = stat.sort(function(a, b) { return b[1] - a[1] });
		var sum = 0;
		$.each(stat, function(i,v) { sum = sum + v[1]; })
		
		// render items
		$.each(stat, function(i, v) { 
			me.render_stat_item(i, v, sum, field).appendTo($w.find('.stat-grid'));
		});
		
		$w.appendTo(this.$page.find('.layout-side-section'));
	},
	render_stat_item: function(i, v, max, field) {
		var me = this;
		var args = {}
		args.label = v[0];
		args.width = flt(v[1]) / max * 100;
		args.count = v[1];
		args.field = field;
		
		$item = $(repl('<div class="stat-item">\
			<div class="stat-bar" style="width: %(width)s%"></div>\
			<div class="stat-label">\
				<a href="#" data-label="%(label)s" data-field="%(field)s">\
					%(label)s</a> \
				(%(count)s)</div>\
		</div>', args));
		
		this.setup_stat_item_click($item);
		return $item;
	},
	setup_stat_item_click: function($item) {
		var me = this;
		$item.find('a').click(function() {
			var fieldname = $(this).attr('data-field');
			var label = $(this).attr('data-label');
			me.set_filter(fieldname, label);
			return false;
		});		
	},
	set_filter: function(fieldname, label) {
		var filter = this.filter_list.get_filter(fieldname);
		if(filter) {
			var v = filter.field.get_value();
			if(v.indexOf(label)!=-1) {
				// already set
				return false;
			} else {
				// second filter set for this field
				if(fieldname=='_user_tags') {
					// and for tags
					this.filter_list.add_filter(fieldname, 'like', '%' + label);
				} else {
					// or for rest using "in"
					filter.set_values(fieldname, 'in', v + ', ' + label);
				}
			}
		} else {
			// no filter for this item,
			// setup one
			if(fieldname=='_user_tags') {
				this.filter_list.add_filter(fieldname, 'like', '%' + label);					
			} else {
				this.filter_list.add_filter(fieldname, '=', label);					
			}
		}
		this.run();
	}
});

wn.pages.ListView = Class.extend({
	init: function(doclistview) {
		this.doclistview = doclistview;
		this.doctype = doclistview.doctype;
		
		var t = "`tab"+this.doctype+"`.";
		this.fields = [t + 'name', t + 'owner', t + 'docstatus', 
			t + '_user_tags', t + 'modified'];
		this.stats = ['_user_tags']
	},
	render: function(row, data) {
		this.prepare_data(data);
		
		$(row).html(repl(
			'<span class="list-check hide"><input type="checkbox"></span> \
			<span class="avatar-small"><img src="%(avatar)s" /></span> \
			<span class="docstatus"><i class="%(docstatus_icon)s" \
				title="%(docstatus_title)s"></i></span> \
			<a href="#!Form/%(doctype)s/%(name)s">%(name)s</a>\
			<span class="tags"></span> \
			<span style="float:right; font-size: 11px; color: #888; \
				margin-left: 8px;">%(when)s</span>\
			<span class="main" style=""></span>\
			', data))
			.addClass('list-row');
		
		this.hide_delete(row, data);
		this.add_user_tags(row, data);
		this.$main = $(row).find('.main');
	},
	prepare_data: function(data) {
		data.fullname = wn.user_info(data.owner).fullname;
		data.avatar = wn.user_info(data.owner).image;
		data.when = dateutil.str_to_user(data.modified).split(' ')[0];
		
		// docstatus
		if(data.docstatus==0 || data.docstatus==null) {
			data.docstatus_icon = 'icon-pencil';
			data.docstatus_title = 'Editable';
		} else if(data.docstatus==1) {
			data.docstatus_icon = 'icon-lock';			
			data.docstatus_title = 'Submitted';
		} else if(data.docstatus==2) {
			data.docstatus_icon = 'icon-remove';			
			data.docstatus_title = 'Cancelled';
		}		
	},
	hide_delete: function(row, data) {
		// hide delete
		if(this.parent.can_delete) {
			$(row).find('.list-check')
				.removeClass('hide');
			$(row).find('.list-check input')
				.data('name', data.name);
		}
	},
	add_user_tags: function(row, data) {
		var me = this;
		if(data._user_tags) {
			$.each(data._user_tags.split(','), function(i, t) {
				if(t) {
					$('<span class="label label-info" style="cursor: pointer">' 
						+ strip(t) + '</span>')
						.click(function() {
							me.doclistview.set_filter('_user_tags', $(this).text())
						})
						.appendTo($(row).find('.tags'));
				}
			});
		}		
	}
})
