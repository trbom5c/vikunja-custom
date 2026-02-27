<template>
	<Notifications
		position="bottom left"
		:max="5"
		:ignore-duplicates="true"
		class="global-notification"
	>
		<template #body="{ item, close }">
			<div
				class="vue-notification-template vue-notification"
				:class="[
					item.type,
					{ 'is-sticky': item.data?.sticky },
				]"
				:style="item.data?.accentColor ? { borderLeftColor: item.data.accentColor, borderLeftWidth: '5px' } : {}"
				@click="!item.data?.sticky && close()"
			>
				<div class="notification-header">
					<div
						v-if="item.title"
						class="notification-title"
					>
						{{ item.title }}
					</div>
					<div
						v-if="item.data?.accentColor"
						class="accent-dot"
						:style="{ background: item.data.accentColor }"
					/>
				</div>
				<div class="notification-content">
					<template v-if="Array.isArray(item.text)">
						<template
							v-for="(t, k) in item.text"
							:key="k"
						>
							{{ t }}<br>
						</template>
					</template>
					<template v-else>
						{{ item.text }}
					</template>
					<span
						v-if="item.duplicates > 0"
						class="tw-text-xs tw-font-bold tw-ml-1"
					>
						×{{ item.duplicates + 1 }}
					</span>
				</div>
				<div
					v-if="item.data?.actions?.length > 0"
					class="notification-actions"
				>
					<XButton
						v-for="(action, i) in item.data.actions"
						:key="'action_' + i"
						:shadow="false"
						class="is-small"
						:variant="action.title === 'Dismiss' ? 'tertiary' : 'secondary'"
						:class="{ 'dismiss-btn': action.title === 'Dismiss' }"
						@click="action.callback(); close()"
					>
						{{ action.title }}
					</XButton>
				</div>
			</div>
		</template>
	</Notifications>
</template>

<style scoped>
.vue-notification {
	z-index: 9999;
}

.vue-notification.warning {
	background: #f0ad4e;
	border-left-color: #d48b0c;
	color: #1a1a1a;
}

.vue-notification.warning .notification-title {
	color: #1a1a1a;
	font-weight: 600;
}

.vue-notification.warning .notification-content {
	color: #2a2a2a;
}

.vue-notification.is-sticky {
	animation: toast-pulse 2s ease-in-out 3;
	cursor: default;
}

@keyframes toast-pulse {
	0%, 100% {
		transform: scale(1);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	50% {
		transform: scale(1.02);
		box-shadow: 0 4px 16px rgba(240, 173, 78, 0.4);
	}
}

.notification-header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.accent-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.notification-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin-block-start: 0.5rem;
}

.dismiss-btn {
	opacity: 0.7;
}
.dismiss-btn:hover {
	opacity: 1;
}
</style>
